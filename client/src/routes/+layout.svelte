<script>
	import "./layout.css";
	let { children } = $props();
</script>

<div
	class="min-h-screen bg-gray-900 text-gray-100 font-sans selection:bg-blue-500 selection:text-white"
>
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
			<!-- Future nav items -->
		</div>
	</nav>

	<main class="container mx-auto p-6 animate-in fade-in duration-500">
		{@render children()}
	</main>
</div>
