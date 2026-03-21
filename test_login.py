from database import SessionLocal
from models import User
import hashlib

def verify_password(plain_password, hashed_password):
    return hashlib.sha256(plain_password.encode()).hexdigest() == hashed_password

db = SessionLocal()

# Тестируем разные варианты
test_cases = [
    ("admin", "admin123"),
    ("admin", "wrong"),
    ("host", "host123"),
    ("user", "user123")
]

for login, password in test_cases:
    user = db.query(User).filter(User.login == login).first()
    if user:
        is_valid = verify_password(password, user.password_hash)
        print(f"Login: {login}, Password: {password}, Valid: {is_valid}")
    else:
        print(f"User {login} not found")

db.close()
