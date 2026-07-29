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
SMTP_FROM = os.environ.get("SMTP_FROM", "MYTAMAN AI Tutor <no-reply@mytaman.ai>")
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


def send_child_approval_email(parent_email: str, student_name: str, username: str, token: str) -> bool:
    link = f"{APP_BASE_URL}/approve-child?token={token}"
    body = (
        f"Hello,\n\n"
        f"{student_name} has asked to join MYTAMAN AI Tutor and listed this address as "
        f"their parent or guardian's email.\n\n"
        f"Because {student_name} is a child, their account cannot be activated until you "
        f"approve it. Open the link below to review what they submitted and finish setting "
        f"up their account:\n\n"
        f"    {link}\n\n"
        f"Requested student ID: {username}\n\n"
        f"If you don't have a MYTAMAN parent account yet, the link will walk you through "
        f"creating one first.\n\n"
        f"This link expires in 72 hours. If you weren't expecting this, you can ignore "
        f"this email -- no account will be created.\n\n"
        f"-- MYTAMAN AI Tutor"
    )
    return send_email(parent_email, f"Approve {student_name}'s MYTAMAN account", body)
