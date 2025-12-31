<script>
    let projects = $state([]);
    let newProjectName = $state("");
    let newProjectPath = $state("");
    let activeMode = $state("create"); // 'create' | 'import'

    async function loadProjects() {
        try {
            const res = await fetch("http://localhost:3000/projects");
            if (res.ok) {
                projects = await res.json();
            }
        } catch (e) {
            console.error(e);
        }
    }

    async function addProject() {
        if (!newProjectName) {
            alert("Project name is required");
            return;
        }

        if (activeMode === "import" && !newProjectPath) {
            alert("Project path is required for import");
            return;
        }

        try {
            const body = {
                name: newProjectName,
                createManaged: activeMode === "create",
            };

            if (activeMode === "import") {
                body.path = newProjectPath;
            }

            const res = await fetch("http://localhost:3000/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const err = await res.json();
                alert("Failed: " + err.error);
                return;
            }

            newProjectName = "";
            newProjectPath = "";
            loadProjects();
        } catch (e) {
            alert("Network error");
            console.error(e);
        }
    }

    async function deleteProject(id, event) {
        event.preventDefault(); // Prevent navigation
        if (!confirm("Are you sure you want to remove this project?")) return;

        try {
            await fetch(`http://localhost:3000/projects/${id}`, {
                method: "DELETE",
            });
            loadProjects();
        } catch (e) {
            console.error(e);
        }
    }

    $effect(() => {
        loadProjects();
    });
</script>

<div class="space-y-8">
    <div class="flex justify-between items-end">
        <div>
            <h1
                class="text-3xl font-bold bg-gradient-to-r from-white to-gray-400 bg-clip-text text-transparent"
            >
                Dashboard
            </h1>
            <p class="text-gray-400 mt-1">Manage your local Node.js projects</p>
        </div>
    </div>

    <!-- Add Project Card -->
    <!-- Add Project Card -->
    <div
        class="bg-gray-800/50 backdrop-blur-sm border border-gray-700/50 p-6 rounded-2xl shadow-xl hover:border-gray-600 transition duration-300"
    >
        <div class="flex gap-4 mb-4 border-b border-gray-700/50 pb-2">
            <button
                class="pb-2 text-sm font-semibold transition-colors {activeMode ===
                'create'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'}"
                onclick={() => (activeMode = "create")}
            >
                Create New
            </button>
            <button
                class="pb-2 text-sm font-semibold transition-colors {activeMode ===
                'import'
                    ? 'text-blue-400 border-b-2 border-blue-400'
                    : 'text-gray-400 hover:text-gray-200'}"
                onclick={() => (activeMode = "import")}
            >
                Import Existing
            </button>
        </div>

        <div class="flex flex-col md:flex-row gap-4">
            <input
                type="text"
                bind:value={newProjectName}
                placeholder="Project Name"
                class="flex-1 bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition placeholder-gray-500"
            />
            {#if activeMode === "import"}
                <input
                    type="text"
                    bind:value={newProjectPath}
                    placeholder="Absolute Path"
                    class="flex-[2] bg-gray-900/50 border border-gray-700 rounded-xl px-4 py-3 text-gray-100 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500 outline-none transition placeholder-gray-500"
                />
            {/if}
            <button
                onclick={addProject}
                class="bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition shadow-lg shadow-blue-900/20 active:scale-95 flex items-center justify-center gap-2"
            >
                <span
                    >{activeMode === "create"
                        ? "Create Project"
                        : "Import Project"}</span
                >
            </button>
        </div>
        {#if activeMode === "create"}
            <p class="text-xs text-gray-500 mt-2">
                Creates a managed project in <code
                    class="bg-[#1e1e2f] px-1 rounded">managed_projects/</code
                >
            </p>
        {/if}
    </div>

    <!-- Project Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {#each projects as project}
            <a
                href="/projects/{project.id}"
                class="group relative bg-gray-800 rounded-2xl p-6 border border-gray-700 hover:border-blue-500/50 transition duration-300 hover:shadow-2xl hover:shadow-blue-900/10 hover:-translate-y-1 block overflow-hidden"
            >
                <div
                    class="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition duration-500"
                ></div>

                <div class="relative z-10">
                    <div class="flex justify-between items-start mb-4">
                        <div
                            class="p-3 bg-gray-700/50 rounded-xl text-blue-400 group-hover:text-blue-300 transition"
                        >
                            <!-- Icon placeholder -->
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="w-6 h-6"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                                />
                            </svg>
                        </div>
                        <span
                            class="px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase border {project.status ===
                            'running'
                                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                                : 'bg-gray-700/50 text-gray-400 border-gray-600'}"
                        >
                            {project.status || "stopped"}
                        </span>

                        <button
                            onclick={(e) => deleteProject(project.id, e)}
                            class="p-2 bg-gray-700/50 rounded-lg text-gray-400 hover:bg-red-500/20 hover:text-red-400 transition ml-2"
                            title="Remove Project"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                class="w-4 h-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                            >
                                <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                            </svg>
                        </button>
                    </div>

                    <h3
                        class="text-xl font-bold text-gray-100 mb-1 group-hover:text-blue-400 transition"
                    >
                        {project.name}
                    </h3>
                    <p
                        class="text-sm text-gray-500 font-mono truncate"
                        title={project.path}
                    >
                        {project.path}
                    </p>
                </div>
            </a>
        {/each}

        {#if projects.length === 0}
            <div
                class="col-span-full py-12 text-center text-gray-500 bg-gray-800/30 rounded-2xl border border-dashed border-gray-700"
            >
                <p>No projects found. Add one above to get started.</p>
            </div>
        {/if}
    </div>
</div>
