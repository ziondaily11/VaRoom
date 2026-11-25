"""Guided search: Elie asks before showing a long list, with options built
from the matching listings; tapped answers need no model call; "Show more"
pages through the rest for free; chat answers carry tap-able replies."""

import asyncio
import json
import os
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key-12345")
os.environ.setdefault("SUPABASE_URL", "https://mock-test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "mock-anon-key")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "mock-service-key")

import main  # noqa: E402


def hotel(n, area, price, guests=2, unit="night"):
    return main.reshape_listing({
        "id": f"00000000-0000-4000-8000-{n:012d}", "title": f"Hotel {n}", "category": "hotel",
        "location_text": f"{area}, Nairobi", "neighborhood": area, "city": "Nairobi",
        "booking_details": [{"price_amount": price, "price_unit": unit, "max_guests": guests}],
    })


# 46 hotels: Westlands 18, Kilimani 11, CBD 9, Karen 8; prices 2,000-12,000 a night.
POOL = ([hotel(i, "Westlands", 2000 + i * 200, guests=2 + i % 5) for i in range(18)]
        + [hotel(100 + i, "Kilimani", 3000 + i * 400) for i in range(11)]
        + [hotel(200 + i, "CBD", 2500 + i * 300) for i in range(9)]
        + [hotel(300 + i, "Karen", 8000 + i * 500) for i in range(8)])


def ask(message, refine=None, pool=POOL, llm=None, balance=100):
    payload = main.ElieSearchRequest(message=message, refine=refine)
    calls = {}

    async def search(*args, **kwargs):
        calls["search"] = (args, kwargs)
        return list(pool)

    with patch("main.get_profile", new_callable=AsyncMock, return_value={"role": "client"}), \
         patch("main.get_vcoin_wallet", new_callable=AsyncMock, return_value=main.ElieVcoins(balance=balance)), \
         patch("main.spend_vcoins", new_callable=AsyncMock, return_value=main.ElieVcoins(balance=balance - 10, charged=10)) as spend, \
         patch("main.search_listings", side_effect=search), \
         patch("main.generate_no_results_reply", new_callable=AsyncMock, return_value="Nothing there."), \
         patch("main.call_llm", new_callable=AsyncMock, side_effect=llm or (lambda *a, **k: json.dumps({
             "intent": "search", "category": "hotel", "location": "Nairobi", "wants": [], "intro": "Here you go"}))) as model:
        result = asyncio.run(main.answer_elie(payload, {"id": "u1"}, "R"))
    return result, spend, model, calls


def answer(result, **kwargs):
    state = result.refine or result.more.refine
    return state.model_copy(update={"answer": main.ElieAnswer(field=result.question.field, **kwargs)} if kwargs else {})


def test_an_open_search_asks_where_with_the_busiest_areas_free():
    result, spend, _, _ = ask("hotels in nairobi")
    assert result.listings is None
    assert result.question.field == "area" and result.question.step == 1
    assert result.question.text == "Where in Nairobi?", "the card asks only the question"
    assert result.reply == "I found 46 hotels in Nairobi. Where in Nairobi?"
    assert [(o.label, o.count) for o in result.question.options] == [("Westlands", 18), ("Kilimani", 11), ("CBD", 9)]
    assert result.question.other == "Somewhere else…"
    assert result.refine.filters.location == "Nairobi" and result.refine.query == "hotels in nairobi"
    spend.assert_not_awaited()


def test_a_tapped_answer_needs_no_model_call_and_the_next_question_uses_real_prices():
    first, *_ = ask("hotels in nairobi")
    result, spend, model, _ = ask("Westlands", refine=answer(first, value="Westlands"))
    model.assert_not_awaited()
    assert result.question.field == "budget" and result.question.step == 2
    assert result.reply.startswith("I found 18 hotels in Westlands. What's your budget per night?")
    options = result.question.options
    assert [o.value.split("|")[1] for o in options] == ["night"] * len(options)
    assert all(o.count for o in options) and len(options) >= 2
    assert options[0].label.startswith("Under KSh ")
    spend.assert_not_awaited()


def test_after_the_answers_the_listings_show_eight_at_a_time_and_only_the_first_page_is_charged():
    first, *_ = ask("hotels in nairobi")
    second, *_ = ask("Westlands", refine=answer(first, value="Westlands"))
    third, *_ = ask("Skip", refine=answer(second, skip=True))
    assert third.question.field == "guests"
    assert "budget" in third.refine.asked and third.refine.filters.max_price is None, "skipped: no filter"
    results, spend, _, _ = ask("4 guests", refine=answer(third, value="4"))
    assert results.question is None, "three questions at most"
    matching = [h for h in POOL if h["area"] == "Westlands" and h["max_guests"] >= 4]
    assert len(results.listings) == min(8, len(matching))
    spend.assert_awaited_once()

    if results.more:
        more, spend_more, model, _ = ask("Show more", refine=results.more.refine, balance=0)
        model.assert_not_awaited()
        spend_more.assert_not_awaited()
        assert more.reply.startswith("Here are ")
        assert not {l.id for l in more.listings} & {l.id for l in results.listings}, "never the same listing twice"


def test_a_small_search_shows_its_listings_at_once():
    result, spend, _, _ = ask("hotels in karen", pool=POOL[-8:])
    assert result.question is None and len(result.listings) == 8 and result.more is None
    spend.assert_awaited_once()


def test_typed_answers_somewhere_else_and_other_amount():
    first, *_ = ask("hotels in nairobi")
    karen, *_ = ask("Karen", refine=answer(first, text="Karen"))
    assert karen.question is None and len(karen.listings) == 8, "8 hotels in Karen: shown at once"
    assert karen.filters.area == "Karen"
    assert {l["area"] for l in POOL if main.fits(l, karen.filters)} == {"Karen"}
    in_karen = first.refine.model_copy(update={"filters": karen.filters})
    state = main.apply_answer(in_karen.model_copy(update={"answer": main.ElieAnswer(field="budget", text="9k")}))
    assert state.filters.max_price == 9000
    state = main.apply_answer(in_karen.model_copy(update={"answer": main.ElieAnswer(field="budget", value="3000-7000|night")}))
    assert (state.filters.min_price, state.filters.max_price, state.filters.price_unit) == (3000, 7000, "night")
    assert main.fits(hotel(1, "Karen", 5000), state.filters)
    assert not main.fits(hotel(2, "Karen", 2500), state.filters)
    assert not main.fits(hotel(3, "Karen", 5000, unit="month"), state.filters)


def test_with_no_category_elie_first_asks_what_kind_of_place():
    mixed = POOL[:10] + [dict(h, category="airbnb") for h in POOL[10:20]]
    llm = lambda *a, **k: json.dumps({"intent": "search", "category": None, "location": "Nairobi", "wants": [], "intro": "x"})
    result, *_ = ask("places in nairobi", pool=mixed, llm=llm)
    assert result.question.field == "category"
    assert {(o.value, o.count) for o in result.question.options} == {("hotel", 10), ("airbnb", 10)}
    assert result.question.other is None


def test_areas_come_from_the_neighbourhood_or_the_location():
    assert main.listing_area({"neighborhood": "kilimani", "city": "Nairobi"}) == "Kilimani"
    assert main.listing_area({"location_text": "Syokimau, Machakos"}) == "Syokimau"
    assert main.listing_area({"neighborhood": "Nairobi", "city": "Nairobi"}) is None
    assert main.listing_area({"location_text": "Nairobi"}) is None
    assert main.parse_price("KSh 5,000") == 5000 and main.parse_price("5k") == 5000 and main.parse_price("cheap") is None


def test_chat_answers_carry_quick_replies():
    llm = lambda *a, **k: json.dumps({"intent": "chat", "chat_reply": "Want me to look in Kilimani instead?", "quick_replies": ["Yes", "No", "x" * 50, "Maybe", "Later"]})
    result, *_ = ask("hmm", llm=llm)
    assert result.quick_replies == ["Yes", "No", "x" * 30]


def test_the_saved_answer_keeps_the_question_paging_and_quick_replies():
    posted = {}

    class Client:
        async def get(self, *args, **kwargs):
            return httpx.Response(200, json=[{"id": "s"}], request=httpx.Request("GET", "https://x"))

        async def post(self, url, json=None, **kwargs):
            posted["rows"] = json
            return httpx.Response(201, request=httpx.Request("POST", url))

        async def patch(self, *args, **kwargs):
            return httpx.Response(204, request=httpx.Request("PATCH", "https://x"))

    first, *_ = ask("hotels in nairobi")
    first.quick_replies = ["Yes"]
    with patch("main._pooled_client", return_value=Client()):
        assert asyncio.run(main.save_elie_turns("00000000-0000-4000-8000-000000000001", "u1", "hotels", first, "R")) is True
    saved = posted["rows"][1]["results"]
    assert saved["question"]["field"] == "area"
    assert saved["refine"]["filters"]["location"] == "Nairobi"
    assert saved["quick_replies"] == ["Yes"]
