<script>
    import { auth } from "../../stores/auth";
    import { goto } from "$app/navigation";

    let username = "";
    let password = "";
    let error = "";
    let loading = false;

    async function handleLogin() {
        loading = true;
        error = "";
        try {
            const res = await fetch("http://localhost:3000/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ username, password }),
            });

            if (res.ok) {
                const data = await res.json();
                auth.login(data.token, data.username);
                goto("/");
            } else {
                const err = await res.json();
                error = err.error || "Login failed";
            }
        } catch (e) {
            error = "Network error";
        } finally {
            loading = false;
        }
    }
</script>

<div class="min-h-screen bg-[#1e1e2f] flex items-center justify-center p-4">
    <div
        class="bg-[#2d2d44] p-8 rounded-xl shadow-2xl w-full max-w-md border border-gray-700/50"
    >
        <h1 class="text-3xl font-bold text-white mb-6 text-center">
            Master Login
        </h1>

        {#if error}
            <div
                class="bg-red-500/10 border border-red-500/50 text-red-500 p-3 rounded mb-4 text-sm text-center"
            >
                {error}
            </div>
        {/if}

        <form class="space-y-4" on:submit|preventDefault={handleLogin}>
            <div>
                <label class="block text-gray-400 text-sm font-bold mb-2"
                    >Username</label
                >
                <input
                    type="text"
                    bind:value={username}
                    class="w-full bg-[#1e1e2f] border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none"
                    placeholder="Enter username"
                />
            </div>
            <div>
                <label class="block text-gray-400 text-sm font-bold mb-2"
                    >Password</label
                >
                <input
                    type="password"
                    bind:value={password}
                    class="w-full bg-[#1e1e2f] border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none"
                    placeholder="Enter password"
                />
            </div>
            <button
                type="submit"
                disabled={loading}
                class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded transition shadow-lg disabled:opacity-50"
            >
                {loading ? "Logging in..." : "Login"}
            </button>
        </form>
    </div>
</div>
