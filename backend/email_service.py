"""Outbound email with a console fallback.

SMTP is configured entirely through env vars. When they're absent -- which is the
case in local dev and until the real mailbox is provisioned -- nothing is sent and
the message (including any approval link) is logged instead, so the parent-approval
flow stays fully testable without a mail provider.
"""
import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)

SMTP_HOST = os.environ.get("SMTP_HOST")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
SMTP_FROM = os.environ.get("SMTP_FROM", "Lv99.ai <no-reply@mytaman.ai>")
SMTP_STARTTLS = os.environ.get("SMTP_STARTTLS", "true").lower() != "false"

# Where the emailed links point. Must be the address a parent's browser can reach --
# not the backend's own host.
APP_BASE_URL = os.environ.get("APP_BASE_URL", "http://localhost:3000").rstrip("/")


def is_configured() -> bool:
    return bool(SMTP_HOST)


def send_email(to: str, subject: str, text_body: str) -> bool:
    """Returns whether the mail was actually handed to an SMTP server. A False return
    is not an error -- it means we're in console-fallback mode. Delivery failures are
    logged and swallowed rather than raised, so a mail outage can't roll back a
    registration the user already completed."""
    if not is_configured():
        logger.warning(
            "[email disabled -- no SMTP_HOST set] would send to %s\nSubject: %s\n%s",
            to, subject, text_body,
        )
        return False

    msg = EmailMessage()
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text_body)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            if SMTP_STARTTLS:
                server.starttls()
            if SMTP_USER:
                server.login(SMTP_USER, SMTP_PASSWORD or "")
            server.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


def send_parent_invite_email(parent_email: str, student_name: str, token: str) -> bool:
    """An invitation, not a gate. The child is already learning -- this asks the parent
    to come along, so the tone is welcoming rather than administrative and it leads with
    what the parent gets rather than what the system needs from them."""
    link = f"{APP_BASE_URL}/connect-child?token={token}"
    body = (
        f"Hi,\n\n"
        f"Great news -- {student_name} has started learning on Lv99.ai!\n\n"
        f"They listed you as their parent or guardian. Join as a Parent to follow their "
        f"learning journey and support their academic growth. Creating an account only "
        f"takes a minute.\n\n"
        f"As a parent you'll be able to:\n\n"
        f"  * Monitor {student_name}'s learning progress as it happens\n"
        f"  * See which subjects they're strongest in, and which topics need work\n"
        f"  * Track how consistently they're studying, day to day\n"
        f"  * Receive AI-generated insights and reports on their learning\n"
        f"  * Support their academic growth with what actually helps\n\n"
        f"Create your Parent account and connect with {student_name}:\n\n"
        f"    {link}\n\n"
        f"Already have a Lv99.ai parent account? The same link will connect "
        f"{student_name} to it.\n\n"
        f"This invitation expires in 30 days. {student_name} can send you a fresh one "
        f"from their portal at any time.\n\n"
        f"If you weren't expecting this, you can safely ignore this email -- nothing "
        f"will be shared with you unless you accept.\n\n"
        f"-- Lv99.ai"
    )
    return send_email(
        parent_email,
        f"{student_name} has started learning on Lv99.ai -- join them!",
        body,
    )
