export const SERVICE_WORKER_UPDATE_AVAILABLE_EVENT = 'travel-tracker-service-worker-update-available';
export const SERVICE_WORKER_APPLY_UPDATE_EVENT = 'travel-tracker-service-worker-apply-update';
export const SERVICE_WORKER_OFFLINE_READY_EVENT = 'travel-tracker-service-worker-offline-ready';
export const SERVICE_WORKER_OFFLINE_READY_DETAIL_STORAGE_KEY =
  'travel-tracker-service-worker-offline-ready-detail-v1';

export type ServiceWorkerOfflineReadyDetail = {
  warmedRouteCount: number;
  warmedDataCount: number;
  failedRouteCount: number;
  failedDataCount: number;
  tripCount: number;
  costEntryCount: number;
  timestamp: string;
};
