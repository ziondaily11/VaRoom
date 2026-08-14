"""
VaRoom Chatbot Service — scaffold only.

This is a standalone microservice, separate from the Node/Express backend
in server/. It will eventually give hosts a paid option to auto-reply to
client inquiries about their listings instead of answering manually.

Nothing here talks to Supabase or a real AI model yet — /reply currently
returns a canned response so the rest of the system has a stable shape to
build against while the real logic gets filled in later.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

app = FastAPI(
    title="VaRoom Chatbot Service",
    description="Standalone microservice for automated host reply suggestions.",
    version="0.1.0",
)

# Wide open for now during local development. Once this is deployed
# somewhere real, restrict this to the actual VaRoom frontend origin(s)
# instead of "*".
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ReplyRequest(BaseModel):
    message: str
    listing_id: Optional[str] = None
    listing_title: Optional[str] = None
    host_name: Optional[str] = None


class ReplyResponse(BaseModel):
    reply: str


@app.get("/health")
def health_check():
    """Basic liveness check — confirms the service is up and reachable."""
    return {"status": "ok"}


@app.post("/reply", response_model=ReplyResponse)
def reply(payload: ReplyRequest):
    """
    Placeholder reply endpoint.

    Accepts a client's message plus optional listing context, and returns
    a reply string. Right now this is a canned response — no real AI/LLM
    call happens yet. The shape of the request/response is the important
    part at this stage, so the frontend and Node backend can be built
    against a stable contract before real logic lands here.
    """
    if payload.listing_title:
        canned = (
            f"Thanks for your interest in {payload.listing_title}! "
            "This is a placeholder auto-reply from VaRoom's chatbot service — "
            "real AI-generated responses are coming soon."
        )
    else:
        canned = (
            "Thanks for reaching out! This is a placeholder auto-reply from "
            "VaRoom's chatbot service — real AI-generated responses are coming soon."
        )

    return ReplyResponse(reply=canned)
