import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const storedToken = browser ? localStorage.getItem('token') : null;

function createAuthStore() {
    const { subscribe, set, update } = writable({
        isAuthenticated: !!storedToken,
        token: storedToken,
        user: null
    });

    return {
        subscribe,
        login: (token, username) => {
            if (browser) {
                localStorage.setItem('token', token);
            }
            set({ isAuthenticated: true, token, user: username });
        },
        logout: () => {
            if (browser) {
                localStorage.removeItem('token');
            }
            set({ isAuthenticated: false, token: null, user: null });
        }
    };
}

export const auth = createAuthStore();
