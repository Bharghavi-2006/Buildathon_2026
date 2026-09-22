from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import KnowledgeDocument

class SimpleRetriever:
    """Deterministic lexical (term-overlap) retrieval over KnowledgeDocument rows.

    Not embeddings/TF-IDF -- a first working retrieval layer the architecture can be
    upgraded to embeddings behind later without changing callers. When campaign_id is
    given, retrieval is scoped to that campaign's own documents plus 'global' ones, so a
    draft only ever cites knowledge actually attached to its own campaign.
    """
    async def retrieve(self, db: AsyncSession, query: str, limit: int=3, campaign_id: str|None=None) -> list[dict]:
        terms=set(query.lower().split())
        stmt=select(KnowledgeDocument)
        if campaign_id: stmt=stmt.where(or_(KnowledgeDocument.category=='global',KnowledgeDocument.category==f'campaign_{campaign_id}'))
        docs=(await db.scalars(stmt)).all()
        scored=[(d,len(terms & set((d.title+' '+d.content).lower().split()))) for d in docs]
        ranked=sorted(scored,key=lambda x:x[1],reverse=True)[:limit]
        return [{'document_id':d.id,'title':d.title,'content':d.content[:600],'category':d.category,'score':score} for d,score in ranked]
