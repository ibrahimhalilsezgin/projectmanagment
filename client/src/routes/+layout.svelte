<script>
	import "./layout.css";
	import { auth } from "../stores/auth";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";

	let { children } = $props();

	$effect(() => {
		if (!$auth.isAuthenticated && $page.url.pathname !== "/login") {
			goto("/login");
		}
	});

	function handleLogout() {
		auth.logout();
		goto("/login");
	}

	import { get } from "svelte/store";

	let showChangePassword = $state(false);
	let currentPassword = $state("");
	let newPassword = $state("");

	async function handleChangePassword() {
		try {
			const res = await fetch(
				"http://localhost:3000/auth/change-password",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${get(auth).token}`,
					},
					body: JSON.stringify({ currentPassword, newPassword }),
				},
			);

			if (res.ok) {
				alert("Password updated successfully");
				showChangePassword = false;
				currentPassword = "";
				newPassword = "";
			} else {
				const err = await res.json();
				alert(`Error: ${err.error}`);
			}
		} catch (e) {
			alert("Network error");
		}
	}
</script>

<div
	class="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-blue-500 selection:text-white"
>
	{#if $page.url.pathname !== "/login"}
		<nav
			class="bg-gray-800/80 backdrop-blur-md sticky top-0 z-50 border-b border-gray-700 px-6 py-4"
		>
			<div class="container mx-auto flex justify-between items-center">
				<a
					href="/"
					class="text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 tracking-tight hover:opacity-80 transition"
				>
					NodeManager
				</a>

				{#if $auth.isAuthenticated}
					<div class="flex items-center gap-4">
						<button
							onclick={() => (showChangePassword = true)}
							class="text-sm text-gray-400 hover:text-white transition"
						>
							Change Password
						</button>
						<span class="text-sm text-gray-400">|</span>
						<span class="text-sm text-gray-400">{$auth.user}</span>
						<button
							onclick={handleLogout}
							class="text-sm bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 px-3 py-1 rounded transition"
						>
							Logout
						</button>
					</div>
				{/if}
			</div>
		</nav>
	{/if}

	{#if showChangePassword}
		<div
			class="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
		>
			<div
				class="bg-[#2d2d44] border border-gray-700/50 p-6 rounded-xl w-full max-w-sm shadow-2xl"
			>
				<h2 class="text-xl font-bold mb-4">Change Password</h2>
				<div class="space-y-4">
					<div>
						<label class="block text-gray-400 text-sm mb-1"
							>Current Password</label
						>
						<input
							type="password"
							bind:value={currentPassword}
							class="w-full bg-[#1e1e2f] border border-gray-700 rounded p-2 outline-none focus:border-blue-500"
						/>
					</div>
					<div>
						<label class="block text-gray-400 text-sm mb-1"
							>New Password</label
						>
						<input
							type="password"
							bind:value={newPassword}
							class="w-full bg-[#1e1e2f] border border-gray-700 rounded p-2 outline-none focus:border-blue-500"
						/>
					</div>
					<div class="flex gap-2 justify-end mt-4">
						<button
							onclick={() => (showChangePassword = false)}
							class="px-4 py-2 text-gray-400 hover:text-white transition"
						>
							Cancel
						</button>
						<button
							onclick={handleChangePassword}
							class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition disabled:opacity-50"
							disabled={!currentPassword || !newPassword}
						>
							Update
						</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<main class="container mx-auto p-6 animate-in fade-in duration-500">
		{@render children()}
	</main>
</div>
