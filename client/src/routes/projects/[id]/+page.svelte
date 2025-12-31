<script>
    import { page } from "$app/stores";
    import io from "socket.io-client";
    import { onMount, tick } from "svelte";
    import AnsiToHtml from "ansi-to-html";
    import { auth } from "../../../stores/auth";
    import { get } from "svelte/store";

    let projectId = $derived($page.params.id);
    let project = $state(null);
    let apps = $state([]);
    // appStates: { [appName]: { status: 'stopped'|'running', logs: [], uptime: 0 } }
    let appStates = $state({});
    let socket = null;
    let showSettings = $state(false);

    // Config editing
    let configJson = $state("");
    let consoleDivs = {};

    // File Explorer
    let files = $state([]);
    let currentPath = $state(".");
    let fileContent = $state(null);
    let showFileModal = $state(false);
    let selectedFileName = $state("");

    // Ansi to HTML converter for logs
    const ansiConverter = new AnsiToHtml({
        newline: true,
        escapeXML: true,
    });

    function setConsoleRef(node, name) {
        consoleDivs[name] = node;
        return {
            destroy() {
                delete consoleDivs[name];
            },
        };
    }

    async function loadProject() {
        try {
            const res = await fetch("http://localhost:3000/projects", {
                headers: { Authorization: `Bearer ${get(auth).token}` },
            });
            if (res.ok) {
                const projects = await res.json();
                project = projects.find((p) => p.id === projectId);
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function loadConfig() {
        try {
            const res = await fetch(
                `http://localhost:3000/projects/${projectId}/config`,
                {
                    headers: { Authorization: `Bearer ${get(auth).token}` },
                },
            );
            if (res.ok) {
                const config = await res.json();

                if (config.apps && Array.isArray(config.apps)) {
                    apps = config.apps;
                } else {
                    // Legacy/Single mode
                    apps = [
                        {
                            name: "default",
                            displayName: "Main Process", // UI label
                            command: config.command || "npm",
                            args: config.args || ["start"],
                        },
                    ];
                }

                // Initialize states if not exists
                apps.forEach((app) => {
                    if (!appStates[app.name]) {
                        appStates[app.name] = { status: "stopped", logs: [] };
                    }
                });

                loadStats();
            }
        } catch (e) {
            console.error("Failed to load config", e);
        }
    }

    async function loadStats() {
        try {
            const res = await fetch(
                `http://localhost:3000/process/${projectId}/stats`,
                {
                    headers: { Authorization: `Bearer ${get(auth).token}` },
                },
            );
            const data = await res.json();

            // data.apps = { 'Client': { running: true ... } }
            if (data.apps) {
                Object.entries(data.apps).forEach(([name, info]) => {
                    if (appStates[name]) {
                        appStates[name].status = info.running
                            ? "running"
                            : "stopped";
                    }
                });
            } else if (data.running && apps.length === 1) {
                // Fallback for single app backward compat if backend returns flat structure (it shouldn't anymore but safe to have)
                appStates[apps[0].name].status = "running";
            }

            // Stats updates
            if (data.apps) {
                Object.entries(data.apps).forEach(([name, info]) => {
                    if (appStates[name]) {
                        appStates[name].cpu = info.cpu || 0;
                        appStates[name].memory = info.memory || 0;
                        appStates[name].uptime = info.uptime || 0;
                    }
                });
            }
        } catch (e) {
            console.error(e);
        }
    }

    // Poll stats every 3 seconds
    let statsInterval;
    $effect(() => {
        if (!projectId) return;
        statsInterval = setInterval(loadStats, 3000);
        return () => clearInterval(statsInterval);
    });

    $effect(() => {
        if (!projectId) return;

        loadProject();
        loadConfig();
        loadFiles(); // Init file explorer

        // Socket connection
        socket = io("http://localhost:3000");

        // Listen for logs. Since we don't know app names yet fully until config loaded,
        // we might miss some logs if we adhere strictly.
        // But we can listen to wildcards or just setup listeners when apps change?
        // Svelte $effect isn't deep watcher on `apps`.
        // Let's set up a wildcard listener or just listners for known apps.
        // Actually, let's just listen dynamically.
        // Socket.io client side doesn't do wildcards easily.
        // We will loop apps after config load.

        return () => {
            if (socket) socket.disconnect();
        };
    });

    // Watch apps to subscribe logs
    $effect(() => {
        if (!socket || apps.length === 0) return;

        apps.forEach((app) => {
            socket.off(`log:${projectId}:${app.name}`); // Clean prev
            socket.on(`log:${projectId}:${app.name}`, (data) => {
                if (appStates[app.name]) {
                    appStates[app.name].logs = [
                        ...appStates[app.name].logs,
                        data,
                    ];
                    // Auto-scroll
                    if (consoleDivs[app.name]) {
                        setTimeout(() => {
                            consoleDivs[app.name].scrollTop =
                                consoleDivs[app.name].scrollHeight;
                        }, 0);
                    }
                }
            });

            // Legacy fallback for 'default' app if it was configured without explicit app name in backend
            if (app.name === "default") {
                socket.off(`log:${projectId}`); // Clean prev
                socket.on(`log:${projectId}`, (data) => {
                    if (appStates["default"]) {
                        appStates["default"].logs = [
                            ...appStates["default"].logs,
                            data,
                        ];
                        if (consoleDivs["default"]) {
                            setTimeout(() => {
                                consoleDivs["default"].scrollTop =
                                    consoleDivs["default"].scrollHeight;
                            }, 0);
                        }
                    }
                });
            }
        });
    });

    async function runGit(action) {
        // ... (Git logic same, maybe log to a global log or first app log?)
        // Let's log to the first app or a specific "System" log.
        // For now, alert or push to first app.
        const targetApp = apps[0]?.name || "default";
        if (appStates[targetApp]) {
            appStates[targetApp].logs = [
                ...appStates[targetApp].logs,
                `\n> Executing git ${action}...\n`,
            ];
        }

        try {
            const res = await fetch(
                `http://localhost:3000/git/${projectId}/${action}`,
                {
                    method: "POST",
                    headers: { Authorization: `Bearer ${get(auth).token}` },
                },
            );
            const data = await res.json();
            const logs = [];
            if (data.stdout) logs.push(data.stdout);
            if (data.stderr) logs.push(`Error: ${data.stderr}`);
            if (data.error) logs.push(`API Error: ${data.error}`);

            if (appStates[targetApp]) {
                appStates[targetApp].logs = [
                    ...appStates[targetApp].logs,
                    ...logs,
                ];
            }
        } catch (e) {
            if (appStates[targetApp]) {
                appStates[targetApp].logs = [
                    ...appStates[targetApp].logs,
                    `Network Error: ${e.message}`,
                ];
            }
        }
    }

    async function controlProcess(action, appName) {
        if (!appStates[appName]) return;
        appStates[appName].logs = [
            ...appStates[appName].logs,
            `\n> Sending ${action} signal to ${appName}...\n`,
        ];

        try {
            const res = await fetch(
                `http://localhost:3000/process/${projectId}/${action}`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${get(auth).token}`,
                    },
                    body: JSON.stringify({ appName }),
                },
            );
            const data = await res.json();
            if (data.error)
                appStates[appName].logs = [
                    ...appStates[appName].logs,
                    `Error: ${data.error}`,
                ];
            else
                appStates[appName].logs = [
                    ...appStates[appName].logs,
                    `Signal ${action} sent successfully to ${appName}.`,
                ];

            // Refresh status shortly
            setTimeout(loadStats, 1000);
        } catch (e) {
            appStates[appName].logs = [
                ...appStates[appName].logs,
                `Network Error: ${e.message}`,
            ];
        }
    }

    async function showConfigEditor() {
        const res = await fetch(
            `http://localhost:3000/projects/${projectId}/config`,
            {
                headers: { Authorization: `Bearer ${get(auth).token}` },
            },
        );
        if (res.ok) {
            const json = await res.json();
            configJson = JSON.stringify(json, null, 2);
            showSettings = true;
        }
    }

    async function saveConfigJson() {
        try {
            const config = JSON.parse(configJson);
            await fetch(`http://localhost:3000/projects/${projectId}/config`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${get(auth).token}`,
                },
                body: JSON.stringify(config),
            });
            // Log to the first app's console
            const targetApp = apps[0]?.name || "default";
            if (appStates[targetApp]) {
                appStates[targetApp].logs = [
                    ...appStates[targetApp].logs,
                    "\n> Configuration saved.\n",
                ];
            }
            // No need to close settings, we are in a tab
            loadConfig(); // Reload config to reflect changes
        } catch (e) {
            alert("Invalid JSON: " + e.message);
            const targetApp = apps[0]?.name || "default";
            if (appStates[targetApp]) {
                appStates[targetApp].logs = [
                    ...appStates[targetApp].logs,
                    `\n> Failed to save config: ${e.message}\n`,
                ];
            }
        }
    }

    let activeTab = $state("console"); // console, files, git, settings
    let startTime = $state(Date.now());

    // Auto-load config when entering settings tab
    $effect(() => {
        if (activeTab === "settings") {
            // Fetch config text for editor
            fetch(`http://localhost:3000/projects/${projectId}/config`, {
                headers: { Authorization: `Bearer ${get(auth).token}` },
            })
                .then((res) => res.json())
                .then((json) => {
                    configJson = JSON.stringify(json, null, 2);
                })
                .catch((e) =>
                    console.error("Failed to load config for editor", e),
                );
        }
    });

    // UI Formatters
    function formatUptime(ms) {
        if (!ms) return "0m";
        const s = Math.floor(ms / 1000);
        const m = Math.floor(s / 60);
        const h = Math.floor(m / 60);
        const d = Math.floor(h / 24);

        if (d > 0) return `${d}d ${h % 24}h ${m % 60}m`;
        if (h > 0) return `${h}h ${m % 60}m`;
        return `${m}m ${s % 60}s`;
    }

    let selectedItems = $state(new Set());
    let lastSelectedIndex = $state(-1);
    let showCreateModal = $state(false);
    let createType = $state("file"); // 'file' or 'directory'
    let newItemName = $state("");

    // Inline Editor State
    let activeFile = $state(null); // { name: 'foo.txt', path: 'src/foo.txt', content: '...', originalContent: '...' }
    let isSaving = $state(false);

    function toggleSelection(item, index, event) {
        if (event.shiftKey && lastSelectedIndex !== -1) {
            const start = Math.min(lastSelectedIndex, index);
            const end = Math.max(lastSelectedIndex, index);
            const subset = files.slice(start, end + 1);

            // If the clicked item is already selected, deselect the range?
            // Standard behavior: select range.
            subset.forEach((f) => selectedItems.add(f.name));
        } else if (event.ctrlKey || event.metaKey) {
            if (selectedItems.has(item.name)) {
                selectedItems.delete(item.name);
            } else {
                selectedItems.add(item.name);
            }
        } else {
            // Default: Toggle selection
            if (selectedItems.has(item.name)) {
                selectedItems.delete(item.name);
            } else {
                selectedItems.add(item.name);
            }
        }
        // Force reactivity assignment (Svelte 5 Set reactivity might need this or use $state correctly)
        // With $state(new Set()), mutation .add() calls might not trigger updates unless we reassign or use Svelte Set.
        // Let's assume standard behavior: reassign to trigger.
        selectedItems = new Set(selectedItems);
        lastSelectedIndex = index;
    }

    function toggleSelectAll() {
        if (selectedItems.size === files.length) {
            selectedItems = new Set();
        } else {
            selectedItems = new Set(files.map((f) => f.name));
        }
    }

    async function deleteSelected() {
        if (selectedItems.size === 0) return;
        if (
            !confirm(
                `Are you sure you want to delete ${selectedItems.size} items?`,
            )
        )
            return;

        try {
            // We need to send array of names. CurrentPath is managed by backend relative to project root.
            // But backend expects `items` as relative paths from root? Or relative to `currentPath`?
            // My implementation does `absoluteBase = path.join(projectRoot, currentPathOrDot)` and then joins item name.
            // So just filenames are fine IF currentPath is correct.

            const res = await fetch(
                `http://localhost:3000/projects/${projectId}/files/delete`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${get(auth).token}`,
                    },
                    body: JSON.stringify({
                        items: Array.from(selectedItems),
                        currentPath: currentPath,
                    }),
                },
            );

            const result = await res.json();
            if (result.errors && result.errors.length > 0) {
                alert(
                    `Some items failed to delete:\n${result.errors.join("\n")}`,
                );
            }

            selectedItems = new Set();
            loadFiles(currentPath);
        } catch (e) {
            alert("Delete failed");
        }
    }

    async function unzipSelected() {
        if (selectedItems.size !== 1) return;
        const filename = Array.from(selectedItems)[0];
        if (!filename.endsWith(".zip")) return;

        try {
            const filePath =
                currentPath === "." ? filename : `${currentPath}/${filename}`;
            const res = await fetch(
                `http://localhost:3000/projects/${projectId}/files/unzip`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${get(auth).token}`,
                    },
                    body: JSON.stringify({ filePath }),
                },
            );

            if (!res.ok) {
                const err = await res.json();
                alert(`Unzip failed: ${err.error}`);
            } else {
                alert("Extracted successfully");
                loadFiles(currentPath);
            }
        } catch (e) {
            alert("Unzip network error");
        }
    }

    async function createItem() {
        if (!newItemName) return;
        try {
            const res = await fetch(
                `http://localhost:3000/projects/${projectId}/files/create`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${get(auth).token}`,
                    },
                    body: JSON.stringify({
                        parentPath: currentPath,
                        name: newItemName,
                        type: createType,
                    }),
                },
            );

            if (!res.ok) {
                const err = await res.json();
                alert(`Create failed: ${err.error}`);
            } else {
                showCreateModal = false;
                newItemName = "";
                loadFiles(currentPath);
            }
        } catch (e) {
            alert("Create failed");
        }
    }

    // Update loadFiles to clear selection
    async function loadFiles(pathVal = ".") {
        try {
            const res = await fetch(
                `http://localhost:3000/projects/${projectId}/files?path=${encodeURIComponent(pathVal)}`,
                {
                    headers: { Authorization: `Bearer ${get(auth).token}` },
                },
            );
            if (res.ok) {
                files = await res.json();
                currentPath = pathVal;
                selectedItems = new Set(); // Clear selection on navigate
            } else {
                files = [];
            }
        } catch (e) {
            // ignore
        }
    }

    async function navigateUp() {
        if (currentPath === "." || currentPath === "") return;
        const parent = currentPath.split("/").slice(0, -1).join("/") || ".";
        loadFiles(parent);
    }

    async function openItem(item) {
        if (item.isDirectory) {
            const newPath =
                currentPath === "." ? item.name : `${currentPath}/${item.name}`;
            await loadFiles(newPath);
        } else {
            // Open in Inline Editor
            try {
                const filePath =
                    currentPath === "."
                        ? item.name
                        : `${currentPath}/${item.name}`;
                const res = await fetch(
                    `http://localhost:3000/projects/${projectId}/files/read?path=${encodeURIComponent(filePath)}`,
                    {
                        headers: { Authorization: `Bearer ${get(auth).token}` },
                    },
                );
                if (res.ok) {
                    const data = await res.json();
                    activeFile = {
                        name: item.name,
                        path: filePath,
                        content: data.content,
                        originalContent: data.content,
                    };
                } else {
                    alert("Failed to read file");
                }
            } catch (e) {
                alert("Network error reading file");
            }
        }
    }

    async function saveActiveFile() {
        if (!activeFile) return;
        isSaving = true;
        try {
            const res = await fetch(
                `http://localhost:3000/projects/${projectId}/files/write`,
                {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${get(auth).token}`,
                    },
                    body: JSON.stringify({
                        path: activeFile.path,
                        content: activeFile.content,
                    }),
                },
            );

            if (res.ok) {
                activeFile.originalContent = activeFile.content;
                // Optional: visual feedback
            } else {
                const err = await res.json();
                alert(`Save failed: ${err.error}`);
            }
        } catch (e) {
            alert("Save network error");
        } finally {
            isSaving = false;
        }
    }

    function closeActiveFile() {
        if (activeFile && activeFile.content !== activeFile.originalContent) {
            if (!confirm("You have unsaved changes. Close anyway?")) return;
        }
        activeFile = null;
    }

    let isDragging = $state(false);

    function handleDragOver(e) {
        e.preventDefault();
        e.stopPropagation();
        if (activeTab === "files") {
            isDragging = true;
        }
    }

    function handleDragLeave(e) {
        e.preventDefault();
        e.stopPropagation();
        isDragging = false;
    }

    async function handleDrop(e) {
        e.preventDefault();
        e.stopPropagation();
        isDragging = false;

        if (activeTab !== "files") return;

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const formData = new FormData();
            for (let i = 0; i < files.length; i++) {
                formData.append("files", files[i]);
            }

            // Upload to current path
            // We append currentPath as query or separate field?
            // The backend uses ?path= query inside resolvePath middleware.
            try {
                const res = await fetch(
                    `http://localhost:3000/projects/${projectId}/files/upload?path=${encodeURIComponent(currentPath)}`,
                    {
                        method: "POST",
                        headers: { Authorization: `Bearer ${get(auth).token}` },
                        body: formData,
                    },
                );

                if (res.ok) {
                    // Refresh file list
                    loadFiles(currentPath);
                    // Add log
                    const targetApp = apps[0]?.name || "default";
                    if (appStates[targetApp]) {
                        appStates[targetApp].logs = [
                            ...appStates[targetApp].logs,
                            `\n> Uploaded ${files.length} files to ${currentPath || "root"}\n`,
                        ];
                    }
                } else {
                    const err = await res.json();
                    alert(`Upload failed: ${err.error}`);
                }
            } catch (e) {
                alert("Upload network error");
            }
        }
    }
</script>

{#if project}
    <div class="min-h-screen bg-[#1e1e2f] text-gray-200 font-sans pb-20">
        <!-- Top Navigation Bar -->
        <nav
            class="bg-[#2d2d44] border-b border-gray-700/50 px-6 py-4 flex flex-col md:flex-row justify-between items-center sticky top-0 z-40 shadow-md gap-4"
        >
            <div class="flex items-center gap-4 w-full md:w-auto">
                <a href="/" class="text-gray-400 hover:text-white transition">
                    <svg
                        class="w-6 h-6"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        ><path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M10 19l-7-7m0 0l7-7m-7 7h18"
                        ></path></svg
                    >
                </a>
                <div class="flex flex-col">
                    <h1 class="text-xl font-bold text-white tracking-wide">
                        {project.name}
                    </h1>
                    <span
                        class="text-xs text-gray-500 font-mono hidden md:block"
                        >{project.path}</span
                    >
                </div>
                <div
                    class="ml-4 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border {project.status ===
                    'running'
                        ? 'bg-green-500/10 text-green-400 border-green-500/20'
                        : 'bg-red-500/10 text-red-500 border-red-500/20'}"
                >
                    {project.status || "stopped"}
                </div>
            </div>

            <div
                class="flex items-center gap-1 bg-[#1e1e2f] p-1 rounded-lg border border-gray-700/50 overflow-x-auto max-w-full"
            >
                {#each ["console", "files", "git", "settings"] as tab}
                    <button
                        onclick={() => (activeTab = tab)}
                        class="px-4 py-2 rounded-md text-sm font-medium transition capitalize whitespace-nowrap {activeTab ===
                        tab
                            ? 'bg-blue-600 text-white shadow-lg'
                            : 'text-gray-400 hover:text-white hover:bg-gray-700'}"
                    >
                        {tab}
                    </button>
                {/each}
            </div>
        </nav>

        <!-- Main Content Area -->
        <div class="max-w-7xl mx-auto p-4 md:p-8">
            <!-- CONSOLE TAB -->
            {#if activeTab === "console"}
                <div
                    class="grid grid-cols-1 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                    <!-- Left Column: Status Cards -->
                    <div class="space-y-4 lg:col-span-1">
                        <!-- Address / ID Card -->
                        <div
                            class="bg-[#2d2d44] p-4 rounded-xl border border-gray-700/50 shadow-lg"
                        >
                            <div class="flex items-center gap-3 mb-2">
                                <div
                                    class="bg-gray-700/50 p-2 rounded-lg text-blue-400"
                                >
                                    <svg
                                        class="w-5 h-5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        ><path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M19.428 15.428a2 2 0 00-1.022-.547l-2.384-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                                        ></path></svg
                                    >
                                </div>
                                <div>
                                    <h3
                                        class="text-gray-400 text-xs font-bold uppercase tracking-wider"
                                    >
                                        Project ID
                                    </h3>
                                    <p
                                        class="text-gray-200 font-mono text-sm truncate w-32"
                                        title={project.id}
                                    >
                                        {project.id}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Uptime Card -->
                        <div
                            class="bg-[#2d2d44] p-4 rounded-xl border border-gray-700/50 shadow-lg"
                        >
                            <div class="flex items-center gap-3 mb-2">
                                <div
                                    class="bg-gray-700/50 p-2 rounded-lg text-green-400"
                                >
                                    <svg
                                        class="w-5 h-5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        ><path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                        ></path></svg
                                    >
                                </div>
                                <div>
                                    <h3
                                        class="text-gray-400 text-xs font-bold uppercase tracking-wider"
                                    >
                                        Uptime
                                    </h3>
                                    <!-- Use first app's uptime as proxy or max -->
                                    <p class="text-gray-200 font-mono text-sm">
                                        {formatUptime(
                                            Object.values(appStates).find(
                                                (s) => s.status === "running",
                                            )?.uptime || 0,
                                        )}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <!-- Placeholder Stats -->
                        <div
                            class="bg-[#2d2d44] p-4 rounded-xl border border-gray-700/50 shadow-lg opacity-75"
                        >
                            <div class="flex items-center gap-3 mb-2">
                                <div
                                    class="bg-gray-700/50 p-2 rounded-lg text-purple-400"
                                >
                                    <svg
                                        class="w-5 h-5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        ><path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                                        ></path></svg
                                    >
                                </div>
                                <div>
                                    <h3
                                        class="text-gray-400 text-xs font-bold uppercase tracking-wider"
                                    >
                                        CPU Load
                                    </h3>
                                    <p class="text-gray-200 font-mono text-sm">
                                        {Math.round(
                                            Object.values(appStates).reduce(
                                                (acc, s) => acc + (s.cpu || 0),
                                                0,
                                            ),
                                        )} %
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div
                            class="bg-[#2d2d44] p-4 rounded-xl border border-gray-700/50 shadow-lg opacity-75"
                        >
                            <div class="flex items-center gap-3 mb-2">
                                <div
                                    class="bg-gray-700/50 p-2 rounded-lg text-yellow-400"
                                >
                                    <svg
                                        class="w-5 h-5"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        ><path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                        ></path></svg
                                    >
                                </div>
                                <div>
                                    <h3
                                        class="text-gray-400 text-xs font-bold uppercase tracking-wider"
                                    >
                                        Memory
                                    </h3>
                                    <p class="text-gray-200 font-mono text-sm">
                                        {Math.round(
                                            Object.values(appStates).reduce(
                                                (acc, s) =>
                                                    acc + (s.memory || 0),
                                                0,
                                            ) /
                                                1024 /
                                                1024,
                                        )} MB
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Right Column: Terminals & Controls -->
                    <div class="lg:col-span-3 space-y-6">
                        {#each apps as app}
                            <div
                                class="bg-[#2d2d44] rounded-xl border border-gray-700/50 shadow-xl overflow-hidden flex flex-col"
                            >
                                <!-- App Header -->
                                <div
                                    class="bg-[#252538] px-4 py-3 border-b border-gray-700/50 flex justify-between items-center"
                                >
                                    <div class="flex items-center gap-2">
                                        <div
                                            class="w-3 h-3 rounded-full {appStates[
                                                app.name
                                            ]?.status === 'running'
                                                ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]'
                                                : 'bg-red-500'}"
                                        ></div>
                                        <span class="font-bold text-gray-200"
                                            >{app.displayName || app.name}</span
                                        >
                                        <span
                                            class="text-xs text-gray-500 font-mono bg-black/20 px-2 py-0.5 rounded"
                                            >{app.command}
                                            {app.args.join(" ")}</span
                                        >
                                    </div>
                                    <div class="flex gap-2">
                                        {#if appStates[app.name]?.status === "running"}
                                            <button
                                                onclick={() =>
                                                    controlProcess(
                                                        "restart",
                                                        app.name,
                                                    )}
                                                class="bg-[#3b3b54] hover:bg-yellow-600 hover:text-white text-gray-300 px-3 py-1 rounded text-xs font-bold transition uppercase tracking-wide"
                                                >Restart</button
                                            >
                                            <button
                                                onclick={() =>
                                                    controlProcess(
                                                        "stop",
                                                        app.name,
                                                    )}
                                                class="bg-[#3b3b54] hover:bg-red-600 hover:text-white text-gray-300 px-3 py-1 rounded text-xs font-bold transition uppercase tracking-wide"
                                                >Stop</button
                                            >
                                            <button
                                                onclick={() =>
                                                    controlProcess(
                                                        "kill",
                                                        app.name,
                                                    )}
                                                class="bg-[#3b3b54] hover:bg-red-800 hover:text-white text-gray-300 px-3 py-1 rounded text-xs font-bold transition uppercase tracking-wide"
                                                >Kill</button
                                            >
                                        {:else}
                                            <button
                                                onclick={() =>
                                                    controlProcess(
                                                        "start",
                                                        app.name,
                                                    )}
                                                class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-1 rounded text-xs font-bold transition uppercase tracking-wide shadow-lg shadow-blue-900/20"
                                                >Start</button
                                            >
                                        {/if}
                                    </div>
                                </div>

                                <!-- App Stats Bar -->
                                {#if appStates[app.name]?.status === "running"}
                                    <div
                                        class="bg-[#1e1e2f] border-b border-gray-700/50 px-4 py-2 flex gap-6 text-xs font-mono text-gray-400"
                                    >
                                        <span
                                            title="CPU Usage"
                                            class="flex items-center gap-2"
                                        >
                                            <svg
                                                class="w-3 h-3 text-blue-400"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                ><path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                                                /></svg
                                            >
                                            {Math.round(
                                                appStates[app.name]?.cpu || 0,
                                            )}%
                                        </span>
                                        <span
                                            title="Memory Usage"
                                            class="flex items-center gap-2"
                                        >
                                            <svg
                                                class="w-3 h-3 text-purple-400"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                ><path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M13 10V3L4 14h7v7l9-11h-7z"
                                                /></svg
                                            >
                                            {Math.round(
                                                (appStates[app.name]?.memory ||
                                                    0) /
                                                    1024 /
                                                    1024,
                                            )} MB
                                        </span>
                                        <span
                                            title="Uptime"
                                            class="flex items-center gap-2"
                                        >
                                            <svg
                                                class="w-3 h-3 text-green-400"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                ><path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                                                /></svg
                                            >
                                            {formatUptime(
                                                appStates[app.name]?.uptime ||
                                                    0,
                                            )}
                                        </span>
                                    </div>
                                {/if}

                                <!-- Terminal Window -->
                                <div
                                    class="relative bg-[#0f111a] p-4 h-[400px] overflow-hidden flex flex-col"
                                >
                                    <div
                                        class="absolute top-2 right-4 flex gap-2"
                                    >
                                        <button
                                            onclick={() =>
                                                (appStates[app.name].logs = [])}
                                            class="text-xs text-gray-600 hover:text-gray-400 uppercase tracking-widest font-bold"
                                            >Clear</button
                                        >
                                    </div>
                                    <div
                                        use:setConsoleRef={app.name}
                                        class="flex-1 overflow-y-auto font-mono text-xs md:text-sm text-gray-300 space-y-0.5 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent pr-2"
                                    >
                                        {#if appStates[app.name] && appStates[app.name].logs.length > 0}
                                            {#each appStates[app.name].logs as log}
                                                <div
                                                    class="break-words whitespace-pre-wrap leading-tight"
                                                >
                                                    {@html ansiConverter.toHtml(
                                                        log,
                                                    )}
                                                </div>
                                            {/each}
                                        {:else}
                                            <div
                                                class="h-full flex items-center justify-center text-gray-700 select-none"
                                            >
                                                <div class="text-center">
                                                    <p class="mb-2">
                                                        Server is offline
                                                    </p>
                                                    <p class="text-xs">
                                                        Type a command or press
                                                        Start...
                                                    </p>
                                                </div>
                                            </div>
                                        {/if}
                                    </div>

                                    <!-- Input Placeholder (Future: Real stdin) -->
                                    <div
                                        class="mt-2 flex items-center gap-2 border-t border-gray-800 pt-2 opacity-50"
                                    >
                                        <span class="text-blue-500">❯</span>
                                        <input
                                            type="text"
                                            placeholder="Type a command..."
                                            class="bg-transparent border-none outline-none text-gray-400 text-sm w-full font-mono"
                                            disabled
                                        />
                                    </div>
                                </div>
                            </div>
                        {/each}

                        <!-- Graphs Row (Mockup for now) -->
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div
                                class="bg-[#2d2d44] p-4 rounded-xl border border-gray-700/50 h-48 flex flex-col"
                            >
                                <h3
                                    class="text-gray-400 text-xs font-bold uppercase tracking-wider mb-4"
                                >
                                    Network (Inbound/Outbound)
                                </h3>
                                <div
                                    class="flex-1 flex items-end justify-between gap-1 opacity-50"
                                >
                                    {#each Array(20) as _}
                                        <div
                                            class="w-full bg-blue-500/20 rounded-t"
                                            style="height: {Math.random() *
                                                100}%"
                                        ></div>
                                    {/each}
                                </div>
                            </div>
                            <div
                                class="bg-[#2d2d44] p-4 rounded-xl border border-gray-700/50 h-48 flex flex-col"
                            >
                                <h3
                                    class="text-gray-400 text-xs font-bold uppercase tracking-wider mb-4"
                                >
                                    Memory Usage
                                </h3>
                                <div
                                    class="flex-1 flex items-end justify-between gap-1 opacity-50"
                                >
                                    {#each Array(20) as _}
                                        <div
                                            class="w-full bg-purple-500/20 rounded-t"
                                            style="height: {30 +
                                                Math.random() * 20}%"
                                        ></div>
                                    {/each}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- FILES TAB -->
            {#if activeTab === "files"}
                <!-- Files Panel -->
                <div
                    class="bg-[#1e1e2f] border border-gray-700/50 rounded-xl overflow-hidden flex flex-col h-[600px] {isDragging
                        ? 'ring-2 ring-blue-500 ring-offset-2 ring-offset-[#1e1e2f]'
                        : ''}"
                    ondragover={handleDragOver}
                    ondragleave={handleDragLeave}
                    ondrop={handleDrop}
                >
                    <!-- Drag Overlay -->
                    {#if isDragging}
                        <div
                            class="absolute inset-0 z-50 bg-blue-500/20 backdrop-blur-sm flex flex-col items-center justify-center border-4 border-dashed border-blue-500 m-2 rounded-lg pointer-events-none"
                        >
                            <svg
                                class="w-16 h-16 text-blue-400 mb-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                ><path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                ></path></svg
                            >
                            <p class="text-2xl font-bold text-blue-100">
                                Drop files to upload
                            </p>
                        </div>
                    {/if}

                    {#if activeFile}
                        <!-- Inline Editor UI -->
                        <div class="flex-1 flex flex-col h-full">
                            <!-- Editor Header -->
                            <div
                                class="bg-[#252538] border-b border-gray-700 p-3 flex justify-between items-center"
                            >
                                <div class="flex items-center gap-3">
                                    <button
                                        onclick={closeActiveFile}
                                        class="text-gray-400 hover:text-white transition"
                                    >
                                        <svg
                                            class="w-5 h-5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            ><path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M10 19l-7-7m0 0l7-7m-7 7h18"
                                            ></path></svg
                                        >
                                    </button>
                                    <h3
                                        class="font-mono text-sm text-gray-200 font-bold"
                                    >
                                        {activeFile.name}
                                    </h3>
                                    {#if activeFile.content !== activeFile.originalContent}
                                        <span
                                            class="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"
                                        ></span>
                                    {/if}
                                </div>
                                <div class="flex items-center gap-2">
                                    <button
                                        class="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors flex items-center gap-2 disabled:opacity-50"
                                        onclick={saveActiveFile}
                                        disabled={isSaving ||
                                            activeFile.content ===
                                                activeFile.originalContent}
                                    >
                                        {#if isSaving}
                                            <svg
                                                class="animate-spin w-4 h-4"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                ><circle
                                                    class="opacity-25"
                                                    cx="12"
                                                    cy="12"
                                                    r="10"
                                                    stroke="currentColor"
                                                    stroke-width="4"
                                                ></circle><path
                                                    class="opacity-75"
                                                    fill="currentColor"
                                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                ></path></svg
                                            >
                                            Saving...
                                        {:else}
                                            <svg
                                                class="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                                ><path
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                    stroke-width="2"
                                                    d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                                                ></path></svg
                                            >
                                            Save
                                        {/if}
                                    </button>
                                </div>
                            </div>
                            <!-- Editor Area -->
                            <div class="flex-1 bg-[#1e1e2f] relative">
                                <textarea
                                    class="w-full h-full bg-transparent text-gray-300 font-mono text-sm p-4 outline-none resize-none"
                                    bind:value={activeFile.content}
                                    spellcheck="false"
                                ></textarea>
                            </div>
                        </div>
                    {:else}
                        <!-- Regular File Explorer UI -->
                        <!-- Action Toolbar -->
                        <div
                            class="px-4 py-2 border-b border-gray-700/50 flex gap-2 overflow-x-auto"
                        >
                            <button
                                class="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 px-3 py-1 rounded text-sm flex items-center gap-2 transition-colors border border-blue-500/30"
                                onclick={() => {
                                    createType = "file";
                                    showCreateModal = true;
                                }}
                            >
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                    ></path></svg
                                >
                                New File
                            </button>
                            <button
                                class="bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 px-3 py-1 rounded text-sm flex items-center gap-2 transition-colors border border-blue-500/30"
                                onclick={() => {
                                    createType = "directory";
                                    showCreateModal = true;
                                }}
                            >
                                <svg
                                    class="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                                    ></path></svg
                                >
                                New Folder
                            </button>

                            {#if selectedItems.size > 0}
                                <div
                                    class="w-px h-6 bg-gray-700 mx-2 self-center"
                                ></div>

                                {#if selectedItems.size === 1 && Array.from(selectedItems)[0].endsWith(".zip")}
                                    <button
                                        class="bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 px-3 py-1 rounded text-sm flex items-center gap-2 transition-colors border border-yellow-500/30"
                                        onclick={unzipSelected}
                                    >
                                        <svg
                                            class="w-4 h-4"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            ><path
                                                stroke-linecap="round"
                                                stroke-linejoin="round"
                                                stroke-width="2"
                                                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                                            ></path></svg
                                        >
                                        Unzip
                                    </button>
                                {/if}

                                <button
                                    class="bg-red-600/20 hover:bg-red-600/30 text-red-400 px-3 py-1 rounded text-sm flex items-center gap-2 transition-colors border border-red-500/30"
                                    onclick={deleteSelected}
                                >
                                    <svg
                                        class="w-4 h-4"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        ><path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                        ></path></svg
                                    >
                                    Delete ({selectedItems.size})
                                </button>
                            {/if}
                        </div>

                        <!-- Breadcrumb / Nav -->
                        <div
                            class="p-2 border-b border-gray-700/50 bg-[#1e1e2f] flex gap-2"
                        >
                            <button
                                disabled={currentPath === "."}
                                onclick={navigateUp}
                                class="p-2 hover:bg-gray-700 rounded-lg text-gray-400 disabled:opacity-30 disabled:cursor-not-allowed transition"
                            >
                                <svg
                                    class="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M15 19l-7-7 7-7"
                                    ></path></svg
                                >
                            </button>
                            <button
                                onclick={() => loadFiles(currentPath)}
                                class="p-2 hover:bg-gray-700 rounded-lg text-gray-400 transition"
                            >
                                <svg
                                    class="w-5 h-5"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                    ></path></svg
                                >
                            </button>
                        </div>

                        <!-- File List -->
                        <div class="flex-1 overflow-y-auto bg-[#1e1e2f]">
                            {#if files.length > 0}
                                <table
                                    class="w-full text-left text-sm text-gray-400"
                                >
                                    <thead>
                                        <tr
                                            class="text-left bg-white/5 text-gray-400 uppercase text-xs"
                                        >
                                            <th class="p-4 w-10">
                                                <input
                                                    type="checkbox"
                                                    class="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-offset-gray-900"
                                                    checked={files.length > 0 &&
                                                        selectedItems.size ===
                                                            files.length}
                                                    onclick={toggleSelectAll}
                                                />
                                            </th>
                                            <th class="p-4">Name</th>
                                            <th class="p-4 w-24">Size</th>
                                            <th class="p-4 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody class="divide-y divide-gray-800">
                                        {#each files as item, i}
                                            <tr
                                                class="border-b border-gray-700/50 hover:bg-white/5 transition-colors cursor-pointer {selectedItems.has(
                                                    item.name,
                                                )
                                                    ? 'bg-blue-500/10'
                                                    : ''}"
                                                onclick={(e) => {
                                                    // Row click logic handled by checkbox/button specific handlers
                                                    // but we could select row on click too.
                                                }}
                                            >
                                                <td class="p-4">
                                                    <input
                                                        type="checkbox"
                                                        class="rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-offset-gray-900"
                                                        checked={selectedItems.has(
                                                            item.name,
                                                        )}
                                                        onclick={(e) => {
                                                            e.stopPropagation();
                                                            toggleSelection(
                                                                item,
                                                                i,
                                                                e,
                                                            );
                                                        }}
                                                    />
                                                </td>
                                                <td
                                                    class="p-4 font-mono text-sm"
                                                >
                                                    <button
                                                        class="flex items-center gap-3 text-gray-200 hover:text-white transition-colors text-left w-full"
                                                        onclick={() =>
                                                            openItem(item)}
                                                    >
                                                        {#if item.isDirectory}
                                                            <svg
                                                                class="w-5 h-5 text-yellow-500"
                                                                fill="currentColor"
                                                                viewBox="0 0 20 20"
                                                                ><path
                                                                    d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"
                                                                ></path></svg
                                                            >
                                                        {:else}
                                                            <svg
                                                                class="w-5 h-5 text-gray-500"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                viewBox="0 0 24 24"
                                                                ><path
                                                                    stroke-linecap="round"
                                                                    stroke-linejoin="round"
                                                                    stroke-width="2"
                                                                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                                                                ></path></svg
                                                            >
                                                        {/if}
                                                        {item.name}
                                                    </button></td
                                                >
                                                <td
                                                    class="px-6 py-3 font-mono text-xs"
                                                >
                                                    {item.isDirectory
                                                        ? "-"
                                                        : (
                                                              item.size / 1024
                                                          ).toFixed(1) + " KB"}
                                                </td>
                                                <td
                                                    class="px-6 py-3 text-right"
                                                >
                                                    <!-- Actions (Rename/Delete future) -->
                                                    <span
                                                        class="opacity-0 group-hover:opacity-100 transition text-gray-600"
                                                        >...</span
                                                    >
                                                </td>
                                            </tr>
                                        {/each}
                                    </tbody>
                                </table>
                            {:else}
                                <div
                                    class="flex flex-col items-center justify-center py-20 text-gray-600"
                                >
                                    <svg
                                        class="w-16 h-16 mb-4 opacity-20"
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                        ><path
                                            stroke-linecap="round"
                                            stroke-linejoin="round"
                                            stroke-width="2"
                                            d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1m-5 3h6m2-5a2 2 0 012 2v9a2 2 0 01-2 2M5 19h14a2 2 0 01-2 2H5a2 2 0 01-2-2z"
                                        ></path></svg
                                    >
                                    <p>Empty Directory</p>
                                </div>
                            {/if}
                        </div>
                    {/if}
                    <!-- End Regular UI -->
                </div>
            {/if}

            <!-- GIT TAB -->
            {#if activeTab === "git"}
                <div
                    class="animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                    <div
                        class="bg-[#2d2d44] rounded-xl border border-gray-700/50 shadow-xl p-6"
                    >
                        <h2
                            class="text-xl font-bold mb-6 text-white border-b border-gray-700 pb-2"
                        >
                            Version Control
                        </h2>
                        <div
                            class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                        >
                            <button
                                onclick={() => runGit("pull")}
                                class="bg-gray-800 hover:bg-blue-600 group p-6 rounded-xl border border-gray-700 transition flex flex-col items-center gap-3"
                            >
                                <svg
                                    class="w-8 h-8 text-gray-400 group-hover:text-white"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                    ></path></svg
                                >
                                <span
                                    class="text-lg font-bold text-gray-200 group-hover:text-white"
                                    >Pull Changes</span
                                >
                                <span class="text-sm text-gray-500 text-center"
                                    >Update project from remote repository</span
                                >
                            </button>
                            <button
                                onclick={() => runGit("push")}
                                class="bg-gray-800 hover:bg-blue-600 group p-6 rounded-xl border border-gray-700 transition flex flex-col items-center gap-3"
                            >
                                <svg
                                    class="w-8 h-8 text-gray-400 group-hover:text-white"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                    ></path></svg
                                >
                                <span
                                    class="text-lg font-bold text-gray-200 group-hover:text-white"
                                    >Push Changes</span
                                >
                                <span class="text-sm text-gray-500 text-center"
                                    >Upload local commits to remote</span
                                >
                            </button>
                            <button
                                onclick={() => runGit("status")}
                                class="bg-gray-800 hover:bg-blue-600 group p-6 rounded-xl border border-gray-700 transition flex flex-col items-center gap-3"
                            >
                                <svg
                                    class="w-8 h-8 text-gray-400 group-hover:text-white"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    ><path
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        stroke-width="2"
                                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                                    ></path></svg
                                >
                                <span
                                    class="text-lg font-bold text-gray-200 group-hover:text-white"
                                    >Git Status</span
                                >
                                <span class="text-sm text-gray-500 text-center"
                                    >Check working tree status</span
                                >
                            </button>
                        </div>
                    </div>
                </div>
            {/if}

            <!-- SETTINGS TAB -->
            {#if activeTab === "settings"}
                <div
                    class="animate-in fade-in slide-in-from-bottom-2 duration-300"
                >
                    <div
                        class="bg-[#2d2d44] rounded-xl border border-gray-700/50 shadow-xl p-6"
                    >
                        <div
                            class="flex justify-between items-center mb-6 border-b border-gray-700 pb-4"
                        >
                            <div>
                                <h2 class="text-xl font-bold text-white">
                                    Startup Configuration
                                </h2>
                                <p class="text-gray-400 text-sm mt-1">
                                    Edit `nodemanager.json` directly to
                                    configure applications.
                                </p>
                            </div>
                            <button
                                onclick={() => {
                                    // Trigger config load first just in case
                                    showConfigEditor();
                                    saveConfigJson(); // Actually showConfigEditor fills state. We need a way to just SAVE current state of textarea.
                                    // Wait, the logic is mixed in the old code.
                                    // Let's rely on showConfigEditor() to populate `configJson` when tab opens?
                                    // Ideally we load config when tab opens.
                                }}
                                class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold shadow-lg shadow-blue-900/20"
                            >
                                Save Changes
                            </button>
                        </div>

                        <!-- JSON Editor -->
                        <div class="relative">
                            <textarea
                                bind:value={configJson}
                                class="w-full h-[500px] bg-[#0f111a] border border-gray-700 rounded-xl px-4 py-4 text-gray-200 font-mono text-sm focus:ring-2 focus:ring-blue-500 outline-none leading-relaxed"
                            ></textarea>
                            <div
                                class="absolute top-2 right-4 text-xs text-gray-500 font-mono"
                            >
                                nodemanager.json
                            </div>
                        </div>
                    </div>
                </div>
            {/if}
        </div>
    </div>

    <!-- File Viewer Modal (Global) -->
    <!-- Modal Removed (using Inline Editor) -->

    {#if showCreateModal}
        <div
            class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onclick={() => (showCreateModal = false)}
        >
            <div
                class="bg-[#2d2d44] border border-gray-700 p-6 rounded-lg w-96 shadow-xl"
                onclick={(e) => e.stopPropagation()}
            >
                <h3 class="text-xl font-bold text-gray-200 mb-4">
                    Create New {createType === "directory" ? "Folder" : "File"}
                </h3>
                <input
                    type="text"
                    class="w-full bg-[#1e1e2f] border border-gray-600 rounded px-3 py-2 text-gray-200 focus:border-blue-500 outline-none mb-4"
                    placeholder={createType === "directory"
                        ? "folder_name"
                        : "filename.txt"}
                    bind:value={newItemName}
                    autofocus
                />
                <div class="flex justify-end gap-3">
                    <button
                        class="px-4 py-2 rounded text-gray-400 hover:text-white transition-colors"
                        onclick={() => (showCreateModal = false)}
                    >
                        Cancel
                    </button>
                    <button
                        class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                        onclick={createItem}
                    >
                        Create
                    </button>
                </div>
            </div>
        </div>
    {/if}
{:else}
    <div class="min-h-screen bg-[#1e1e2f] flex items-center justify-center">
        <div class="flex flex-col items-center gap-4">
            <div
                class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"
            ></div>
            <p class="text-gray-500 font-mono animate-pulse">
                Initializing Panel...
            </p>
        </div>
    </div>
{/if}
