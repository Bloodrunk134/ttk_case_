from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database import get_db
from models import User
from schemas import UserCreate, UserLogin, UserResponse, Token, SuccessResponse
from auth import verify_password, get_password_hash, create_access_token, get_current_user
import json
import hashlib

router = APIRouter(prefix="/api", tags=["auth"])

@router.post("/register", response_model=SuccessResponse)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Регистрация нового пользователя"""
    
    # Проверка существования пользователя
    existing_user = db.query(User).filter(User.login == user_data.login).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пользователь с таким логином уже существует"
        )
    
    # Создание пользователя
    db_user = User(
        login=user_data.login,
        full_name=user_data.full_name,
        password_hash=get_password_hash(user_data.password),
        roles=json.dumps(['user'])
    )
    
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return {"message": "Регистрация успешна"}

@router.post("/login", response_model=Token)
async def login(user_data: UserLogin, db: Session = Depends(get_db)):
    """Вход в систему"""
    
    # Ищем пользователя
    user = db.query(User).filter(
        User.login == user_data.login, 
        User.deleted_at.is_(None)
    ).first()
    
    print(f"=== Login attempt ===")
    print(f"Login: {user_data.login}")
    print(f"User found: {user is not None}")
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль"
        )
    
    # Проверяем пароль
    is_valid = verify_password(user_data.password, user.password_hash)
    print(f"Password valid: {is_valid}")
    
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный логин или пароль"
        )
    
    # Получаем роли
    try:
        roles = json.loads(user.roles) if isinstance(user.roles, str) else user.roles
    except:
        roles = ['user']
    
    print(f"Roles: {roles}")
    
    # Создаем токен
    access_token = create_access_token(
        data={"user_id": user.id, "roles": roles}
    )
    
    print(f"Login successful for: {user_data.login}")
    print(f"==================")
    
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Получение информации о текущем пользователе"""
    
    try:
        roles = json.loads(current_user.roles) if isinstance(current_user.roles, str) else current_user.roles
    except:
        roles = ['user']
    
    return UserResponse(
        id=current_user.id,
        login=current_user.login,
        full_name=current_user.full_name,
        roles=roles,
        created_at=current_user.created_at
    )
