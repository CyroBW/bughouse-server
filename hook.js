(function() {
    if (window.self === window.top) {    
        window.websockets = [];
        window.OriginalWebSocket = window.WebSocket;
        window.WebSocket = new Proxy(WebSocket, {
            construct(target, args) {
                const wsObject = new target(...args);
                window.websockets.push(wsObject);
                return wsObject;
            },
        });

        window.nextMessageId = (() => {
            let messageId = 10000;
            return () => {
                messageId++;
                return messageId.toString();
            };
        })();

        var _object;
        Object.defineProperty(window, 'Config', {
            get: function() {
                return _object;
            },
            set: function(object) {
                _object = object;
                _object = new Proxy(_object, {
                    set(target, key, value) {
                        if (key === 'cometd.disconnectTimeout' || key === 'cometd.beforeDisconnectTimeout') {
                            target[key] = value * 100;
                        } else {
                            target[key] = value;
                        }
                        return true;
                    },
                });
            }
        });
    }
})();