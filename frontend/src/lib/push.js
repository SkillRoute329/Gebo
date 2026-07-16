import { supabase } from './supabase';

// Utilidad base64 para convertir la clave pública VAPID
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestPushPermissionAndSubscribe(usuario_id) {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        console.warn('Push messaging is not supported');
        return false;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.warn('Push permission denied');
            return false;
        }

        // Registrar SW si no existe
        const registration = await navigator.serviceWorker.register('/sw.js');
        await navigator.serviceWorker.ready;

        // Verificar suscripción actual
        let subscription = await registration.pushManager.getSubscription();
        
        if (!subscription) {
            const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
            if (!VAPID_PUBLIC_KEY) {
                console.error("Falta VITE_VAPID_PUBLIC_KEY en .env");
                return false;
            }

            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
        }

        // Guardar en Supabase
        const subData = subscription.toJSON();
        
        const { error } = await supabase
            .from('push_subscriptions')
            .upsert({
                usuario_id: usuario_id,
                endpoint: subData.endpoint,
                auth_key: subData.keys.auth,
                p256dh_key: subData.keys.p256dh,
                updated_at: new Date().toISOString()
            }, { onConflict: 'endpoint' });

        if (error) {
            console.error("Error guardando push_subscription", error);
            return false;
        }

        console.log("Push subscripción guardada exitosamente");
        return true;
    } catch (e) {
        console.error("Error suscribiendo a push", e);
        return false;
    }
}
