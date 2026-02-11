from fastapi import APIRouter
from .schedule import router as schedule_router
from .monthly import router as monthly_router
from .daily import router as daily_router
from .analytics import router as analytics_router
from .import_export import router as import_export_router

router = APIRouter()

router.include_router(schedule_router, prefix="/schedule", tags=["schedule"])
router.include_router(monthly_router, prefix="/monthly", tags=["monthly"])
router.include_router(daily_router, prefix="/daily", tags=["daily"])
router.include_router(analytics_router, prefix="/analytics", tags=["analytics"])
router.include_router(import_export_router, prefix="/import-export", tags=["import-export"])