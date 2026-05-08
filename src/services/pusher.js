// pusher-js v8 exports { Pusher: [constructor] }, not the constructor directly.
// We must destructure .Pusher from the module — both `import` and `require()`
// return the wrapper object, which is NOT callable with `new`.
const {Pusher} = require('pusher-js');

const PUSHER_KEY = '5c0dab8f11f43914d9a6';
const PUSHER_CLUSTER = 'us2';
const API_URL = 'https://jo-backend-shop.vercel.app';

let pusherInstance = null;

export function getPusherClient(authToken) {
  if (pusherInstance) {
    if (pusherInstance._lastToken !== authToken) {
      pusherInstance.disconnect();
      pusherInstance = null;
    } else {
      return pusherInstance;
    }
  }

  pusherInstance = new Pusher(PUSHER_KEY, {
    cluster: PUSHER_CLUSTER,
    channelAuthorization: {
      endpoint: `${API_URL}/pusher/auth`,
      transport: 'ajax',
      headersProvider: () => ({
        Authorization: `Bearer ${authToken}`,
        'X-Platform': 'app-delivery',
      }),
    },
  });
  pusherInstance._lastToken = authToken;

  return pusherInstance;
}

export function disconnectPusher() {
  if (pusherInstance) {
    pusherInstance.disconnect();
    pusherInstance = null;
  }
}

export function subscribeToOrderChannel(pusher, orderId) {
  if (!pusher) return null;
  return pusher.subscribe(`private-order-${orderId}`);
}

export function unsubscribeFromOrderChannel(pusher, orderId) {
  if (!pusher) return;
  pusher.unsubscribe(`private-order-${orderId}`);
}
