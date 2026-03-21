from sqlalchemy import Column, Integer, String, Boolean, Text, DateTime, ForeignKey, JSON, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from database import Base
import json

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    login = Column(String(100), unique=True, nullable=False, index=True)
    full_name = Column(String(200), nullable=False)
    password_hash = Column(String(255), nullable=False)
    roles = Column(JSON, nullable=False, default=['user'])
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    
    # Relationships
    messages = relationship("Message", back_populates="user", cascade="all, delete-orphan")
    media_files = relationship("MediaLibrary", back_populates="user", cascade="all, delete-orphan")
    playlists = relationship("Playlist", back_populates="user", cascade="all, delete-orphan")
    
    def get_roles(self):
        return self.roles if isinstance(self.roles, list) else json.loads(self.roles)
    
    def set_roles(self, roles_list):
        self.roles = roles_list

class Message(Base):
    __tablename__ = "messages"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    text = Column(Text, nullable=False)
    status = Column(String(20), nullable=False, default='new')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="messages")

class VoiceMessage(Base):
    __tablename__ = "voice_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_size = Column(Integer, nullable=False)
    duration = Column(Integer, nullable=True)
    status = Column(String(20), nullable=False, default='new')
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    listened_at = Column(DateTime(timezone=True), nullable=True)
    
    user = relationship("User")

class MediaLibrary(Base):
    __tablename__ = "media_library"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_type = Column(String(10), nullable=False)
    file_format = Column(String(10), nullable=False)
    file_size = Column(Integer, nullable=False)
    duration = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    user = relationship("User", back_populates="media_files")
    playlist_items = relationship("PlaylistItem", back_populates="media", cascade="all, delete-orphan")

class Playlist(Base):
    __tablename__ = "playlists"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    is_active = Column(Boolean, default=False)
    loop_mode = Column(Boolean, default=False)
    shuffle_mode = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    
    # Relationships
    user = relationship("User", back_populates="playlists")
    items = relationship("PlaylistItem", back_populates="playlist", cascade="all, delete-orphan")

class PlaylistItem(Base):
    __tablename__ = "playlist_items"
    
    id = Column(Integer, primary_key=True, index=True)
    playlist_id = Column(Integer, ForeignKey("playlists.id", ondelete="CASCADE"), nullable=False)
    media_id = Column(Integer, ForeignKey("media_library.id", ondelete="CASCADE"), nullable=False)
    position = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationships
    playlist = relationship("Playlist", back_populates="items")
    media = relationship("MediaLibrary", back_populates="playlist_items")

class BroadcastStatus(Base):
    __tablename__ = "broadcast_status"
    
    id = Column(Integer, primary_key=True, default=1)
    is_broadcasting = Column(Boolean, default=False)
    current_media_id = Column(Integer, ForeignKey("media_library.id", ondelete="SET NULL"), nullable=True)
    current_media_type = Column(String(10), nullable=True)
    current_position = Column(Integer, nullable=True)
    volume = Column(Integer, default=70)
    is_video_mode = Column(Boolean, default=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class PresenterRecording(Base):
    __tablename__ = "presenter_recordings"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_size = Column(Integer, nullable=False)
    duration = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    added_to_playlist = Column(Boolean, default=False)
    
    user = relationship("User")

class WebcamBroadcast(Base):
    __tablename__ = "webcam_broadcasts"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    stream_key = Column(String(100), unique=True, nullable=True)
    is_active = Column(Boolean, default=True)
    
    user = relationship("User")

class AuditLog(Base):
    __tablename__ = "audit_log"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    entity_type = Column(String(50), nullable=True)
    entity_id = Column(Integer, nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(45), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User")