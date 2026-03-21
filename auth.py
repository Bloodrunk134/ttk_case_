import hashlib
from datetime import datetime, timedelta
from typing import Optional, List
from jose import JWTError, jwt
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import get_db
from models import User
from schemas import TokenData
import json

security = HTTPBearer()

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Проверка пароля с SHA256"""
    result = hashlib.sha256(plain_password.encode()).hexdigest() == hashed_password
    print(f"Password check: {plain_password} -> {result}")
    return result

def get_password_hash(password: str) -> str:
    """Хеширование пароля SHA256"""
    return hashlib.sha256(password.encode()).hexdigest()

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Создание JWT токена"""
    from config import settings
    
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)
    return encoded_jwt

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
) -> User:
    """Получение текущего пользователя из токена"""
    from config import settings
    
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        user_id: int = payload.get("user_id")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id=user_id, roles=payload.get("roles", []))
    except JWTError as e:
        print(f"JWT Error: {e}")
        raise credentials_exception
    
    user = db.query(User).filter(User.id == token_data.user_id, User.deleted_at.is_(None)).first()
    if user is None:
        raise credentials_exception
    
    return user

def role_required(required_roles: List[str]):
    """Декоратор для проверки ролей"""
    async def role_checker(current_user: User = Depends(get_current_user)):
        try:
            user_roles = json.loads(current_user.roles) if isinstance(current_user.roles, str) else current_user.roles
        except:
            user_roles = ['user']
            
        if not any(role in user_roles for role in required_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Недостаточно прав"
            )
        return current_user
    return role_checker
