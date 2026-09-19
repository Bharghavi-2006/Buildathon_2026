from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import KnowledgeDocument
class SimpleRetriever:
    async def retrieve(self, db: AsyncSession, query: str, limit: int=3) -> list[dict]:
        terms=set(query.lower().split()); docs=(await db.scalars(select(KnowledgeDocument))).all()
        ranked=sorted(docs,key=lambda d:len(terms & set((d.title+' '+d.content).lower().split())),reverse=True)
        return [{'document_id':d.id,'title':d.title,'content':d.content[:600]} for d in ranked[:limit]]
