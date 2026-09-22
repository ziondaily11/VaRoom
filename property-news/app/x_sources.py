"""Curated X registry. Entries are intentionally unverified and inactive until
the server-side X API confirms the account belongs to the intended publisher."""
from __future__ import annotations

from .models import Source


# Handles are configuration, not evidence of identity. `seed_x_sources` never
# activates one; XCollector.verify_source is the only activation path.
X_SOURCE_REGISTRY: dict[str, str] = {
    **{h: "government" for h in "Lands_Kenya StateDeptHousing NLC_Kenya BomaYangu NairobiCityGov KiambuCountyGov MachakosGov MombasaCountyKe KajiadoCountyGov".split()},
    **{h: "infrastructure" for h in "KeNHARoads KURAroads KERRA_Roads KonzaTechnopolis LAPSSET".split()},
    **{h: "regulation" for h in "KRACorporate NEMA_Kenya NCA_Kenya KIPPRAKENYA CentBankKenya EPRA_Ke ISK_Kenya BORAQS_Kenya AAK_Kenya IEK_Kenya LSK_Online TownPlannersKe CMAKenya".split()},
    **{h: "property_market" for h in "KPDA_Kenya KNCCI NSE_Ke KBA_Kenya IFC_Africa KGBSKenya EAC_REIT KEPSA_Kenya".split()},
    **{h: "property_media" for h in "BD_Africa StandardKenya NationAfrica CapitalFM_Kenya CitizenTVKenya MetropolTVKE KBCChannel1 TheStarKenya PeopleDailyKe KenyanWallStreet Money254Ke Property24_Ke BuyRentKenya HasConsult KnightFrankKE CytonnReport JLLAfrica BrollKenya VAALRealEstate ApexAfrica".split()},
    **{h: "developer" for h in "CentumRe Tatu_City Acorn_Holdings HFGroupKE MiVidaHomes ShelterAfrique TilisiDev NorthlandsCity GreenparkNbi UnityHomes RebaKenya LAPTRUST_Ke".split()},
    **{h: "banking_finance" for h in "KCBGroup AbsaKenya StanbicKE NCBABankKenya Coopbankenya FamilyBankKE".split()},
    **{h: "commercial_property" for h in "KOFISI_Africa WorkstyleAfrica".split()},
    **{h: "proptech" for h in "Ardhisasa_KE JiungeKE SpekeProperties KaziRemote RentScoreKE NyumbaTek EstateFoxKE RealtorKenya".split()},
}


async def seed_x_sources(repository) -> list[Source]:
    existing = {s.source_account.lower(): s for s in await repository.list_sources() if s.source_account}
    seeded: list[Source] = []
    for handle, category in X_SOURCE_REGISTRY.items():
        prior = existing.get(handle.lower())
        # Startup re-seeding must not discard the canonical X ID returned by
        # the official API during an earlier verification.
        parser_config = {**(prior.parser_config if prior else {}), "registry": "curated_x_v1"}
        values = {
            "name": prior.name if prior else f"X @{handle} (unverified)",
            "base_url": f"https://x.com/{handle}", "source_type": "social", "trust_tier": 2,
            "fetch_method": "api", "schedule_minutes": 30, "active": prior.active if prior else False,
            "platform": "x", "source_account": handle, "verified": prior.verified if prior else False,
            "category": category, "parser_config": parser_config,
        }
        if prior:
            values.update({"id": prior.id, "created_at": prior.created_at})
        seeded.append(await repository.upsert_source(Source(**values)))
    return seeded
