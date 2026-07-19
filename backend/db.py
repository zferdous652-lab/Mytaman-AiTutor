"""Shared DB accessor + Fernet cipher for encrypting secrets."""
import os
from motor.motor_asyncio import AsyncIOMotorClient
from cryptography.fernet import Fernet

_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = _client[os.environ["DB_NAME"]]

_fernet = Fernet(os.environ["FERNET_KEY"].encode())


def encrypt(value: str) -> str:
    return _fernet.encrypt(value.encode()).decode()


def decrypt(value: str) -> str:
    return _fernet.decrypt(value.encode()).decode()
