self.addEventListener('install', () => {
    self.skipWaiting();
});

self.addEventListener('activate', () => {
    return self.clients.claim();
});

self.addEventListener('push', function(event) {
    if (!event.data) return;

    try {
        const payload = event.data.json();
        
        const title = payload.title || 'Gebo';
        const options = {
            body: payload.body || 'Tenés una nueva notificación',
            icon: '/favicon.svg',
            badge: '/favicon.svg',
            data: payload.data || {},
            vibrate: [100, 50, 100],
            requireInteraction: true
        };

        event.waitUntil(
            self.registration.showNotification(title, options)
        );
    } catch (e) {
        console.error("Error parseando push payload:", e);
    }
});

self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const data = event.notification.data;
    let urlToOpen = new URL('/', self.location.origin).href;

    if (data && data.rol) {
        if (data.rol === 'cliente') {
            urlToOpen = new URL('/cliente', self.location.origin).href;
        } else if (data.rol === 'chofer') {
            urlToOpen = new URL('/chofer', self.location.origin).href;
        } else if (data.rol === 'admin') {
            urlToOpen = new URL('/admin', self.location.origin).href;
        }
    }

    event.waitUntil(
        self.clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then(function(windowClients) {
            // Verificar si la app ya está abierta
            let client = null;
            for (let i = 0; i < windowClients.length; i++) {
                const c = windowClients[i];
                if (c.url.startsWith(urlToOpen) && 'focus' in c) {
                    client = c;
                    break;
                }
            }
            if (client) {
                return client.focus();
            } else {
                if (self.clients.openWindow) {
                    return self.clients.openWindow(urlToOpen);
                }
            }
        })
    );
});
