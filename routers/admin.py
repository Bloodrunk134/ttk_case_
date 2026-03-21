from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List
from database import get_db
from models import User
from schemas import (
    UserResponse, UserUpdate, UserRolesUpdate, 
    SuccessResponse, ErrorResponse
)
from auth import role_required, get_password_hash
import json

router = APIRouter(prefix="/api/admin", tags=["admin"])

@router.get("/users", response_model=List[UserResponse])
async def get_users(
    login: Optional[str] = Query(None, description="Фильтр по логину"),
    full_name: Optional[str] = Query(None, description="Фильтр по ФИО"),
    role: Optional[str] = Query(None, description="Фильтр по роли"),
    date_from: Optional[str] = Query(None, description="Дата регистрации от"),
    date_to: Optional[str] = Query(None, description="Дата регистрации до"),
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['admin']))
):
    """Получение списка пользователей (только админ)"""
    
    query = db.query(User).filter(User.deleted_at.is_(None))
    
    if login:
        query = query.filter(User.login.ilike(f"%{login}%"))
    
    if full_name:
        query = query.filter(User.full_name.ilike(f"%{full_name}%"))
    
    if role:
        query = query.filter(User.roles.contains([role]))
    
    if date_from:
        query = query.filter(User.created_at >= date_from)
    
    if date_to:
        query = query.filter(User.created_at <= date_to)
    
    users = query.order_by(User.created_at.desc()).all()
    
    return [
        UserResponse(
            id=user.id,
            login=user.login,
            full_name=user.full_name,
            roles=json.loads(user.roles) if isinstance(user.roles, str) else user.roles,
            created_at=user.created_at
        )
        for user in users
    ]

@router.put("/users/{user_id}", response_model=SuccessResponse)
async def update_user(
    user_id: int,
    user_data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['admin']))
):
    """Редактирование пользователя"""
    
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    user.login = user_data.login
    user.full_name = user_data.full_name
    db.commit()
    
    return {"message": "Пользователь обновлён"}

@router.delete("/users/{user_id}", response_model=SuccessResponse)
async def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['admin']))
):
    """Мягкое удаление пользователя"""
    
    if current_user.id == user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить самого себя"
        )
    
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    from datetime import datetime
    user.deleted_at = datetime.now()
    db.commit()
    
    return {"message": "Пользователь удалён"}

@router.put("/users/{user_id}/password", response_model=SuccessResponse)
async def change_password(
    user_id: int,
    password_data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['admin']))
):
    """Смена пароля пользователя"""
    
    new_password = password_data.get("password")
    if not new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль обязателен"
        )
    
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    user.password_hash = get_password_hash(new_password)
    db.commit()
    
    return {"message": "Пароль изменён"}

@router.put("/users/{user_id}/roles", response_model=SuccessResponse)
async def assign_roles(
    user_id: int,
    roles_data: UserRolesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(role_required(['admin']))
):
    """Назначение ролей пользователю"""
    
    valid_roles = ['user', 'broadcaster', 'admin']
    if not all(role in valid_roles for role in roles_data.roles):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Недопустимые роли"
        )
    
    if current_user.id == user_id and 'admin' not in roles_data.roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя снять с себя роль администратора"
        )
    
    user = db.query(User).filter(User.id == user_id, User.deleted_at.is_(None)).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Пользователь не найден"
        )
    
    user.roles = json.dumps(roles_data.roles)
    db.commit()
    
    return {"message": "Роли назначены"}
