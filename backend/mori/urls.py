from django.urls import path
from django.conf import settings
from django.conf.urls.static import static
from .views import (
    LoadMRI,  
    AnalyzeStatusView,
    ResultsView,
    ProcessMRIView,
    AlzheimerPredictionView,
    ProcessingWebhookView,
    MorphometryAnalysisView,
    MorphometryDataView
)

urlpatterns = [
    path('analyze/', LoadMRI.as_view(), name='analyze_mri'),
    path('process/<int:scan_id>/', ProcessMRIView.as_view(), name='process_mri'),
    path('processing-webhook/', ProcessingWebhookView.as_view(), name='processing_webhook'),
    path('alzheimer-prediction/<int:scan_id>/', AlzheimerPredictionView.as_view(), name='alzheimer_prediction'),
    path('morphometry/<int:scan_id>/', MorphometryAnalysisView.as_view(), name='morphometry_analysis'),
    path('morphometry-data/<int:scan_id>/', MorphometryDataView.as_view(), name='morphometry_data'),
    path('status/<int:scan_id>/', AnalyzeStatusView.as_view(), name='analyze_status'),
    path('results/<int:scan_id>/<str:result_type>/<int:start_slice>', ResultsView.as_view(), name='results'),
    path('mri-scans/<int:scan_id>/', LoadMRI.as_view(), name='get_mri_scan'),
] + static('/mri_files/', document_root=settings.MRI_FILES_PATH) 