from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.session import get_session
from app.db.models import User, AccessProfile

async def current_identity(x_user_email: str | None = Header(default=None), db: AsyncSession = Depends(get_session)):
    if not x_user_email:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Authentication required: send X-User-Email')
    user=await db.scalar(select(User).where(User.email==x_user_email.lower()))
    if not user: raise HTTPException(status.HTTP_401_UNAUTHORIZED, 'Unknown user')
    profile=await db.scalar(select(AccessProfile).where(AccessProfile.user_id==user.id, AccessProfile.active==True))
    if not profile: raise HTTPException(status.HTTP_403_FORBIDDEN, 'User has no active role')
    return user, profile
async def require_manager(identity=Depends(current_identity)):
    if identity[1].role != 'MANAGER': raise HTTPException(status.HTTP_403_FORBIDDEN, 'Manager role required')
    return identity
