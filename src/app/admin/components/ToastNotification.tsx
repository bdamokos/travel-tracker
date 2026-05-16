'use client';

export type ToastNotificationType = 'success' | 'error' | 'info';

export type ToastNotificationState = {
  message: string;
  type: ToastNotificationType;
  isVisible: boolean;
};

type ToastNotificationProps = {
  notification: ToastNotificationState;
  onClose: () => void;
};

export default function ToastNotification({ notification, onClose }: ToastNotificationProps) {
  return (
    <div className={`fixed top-4 right-4 z-50 transition-all duration-300 transform ${
      notification.isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
    }`}>
      <div className={`max-w-sm w-full shadow-lg rounded-lg pointer-events-auto ring-1 ring-black ring-opacity-5 overflow-hidden ${
        notification.type === 'success' ? 'bg-green-50 dark:bg-green-900' :
        notification.type === 'error' ? 'bg-red-50 dark:bg-red-900' :
        'bg-blue-50 dark:bg-blue-900'
      }`}>
        <div className="p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {notification.type === 'success' && (
                <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {notification.type === 'error' && (
                <svg className="h-6 w-6 text-red-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              )}
              {notification.type === 'info' && (
                <svg className="h-6 w-6 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              )}
            </div>
            <div className="ml-3 w-0 flex-1 pt-0.5">
              <p className={`text-sm font-medium ${
                notification.type === 'success' ? 'text-green-800 dark:text-green-200' :
                notification.type === 'error' ? 'text-red-800 dark:text-red-200' :
                'text-blue-800 dark:text-blue-200'
              }`}>
                {notification.message}
              </p>
            </div>
            <div className="ml-4 flex-shrink-0 flex">
              <button
                type="button"
                className={`rounded-md inline-flex ${
                  notification.type === 'success' ? 'text-green-400 hover:text-green-500 focus:ring-green-600' :
                  notification.type === 'error' ? 'text-red-400 hover:text-red-500 focus:ring-red-600' :
                  'text-blue-400 hover:text-blue-500 focus:ring-blue-600'
                } focus:outline-none focus:ring-2 focus:ring-offset-2`}
                onClick={onClose}
              >
                <span className="sr-only">Close</span>
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
