// PolySkill Command-Center Client
let currentCompilation = null;
let currentPresets = {};
let customSkills = [];
let activeSkillId = 'stripe-billing';

// DOM Elements
const customSkillsList = document.getElementById('customSkillsList');
const activeSkillTitle = document.getElementById('activeSkillTitle');
const activeSkillCategoryBadge = document.getElementById('activeSkillCategoryBadge');
const activeSkillSafetyScore = document.getElementById('activeSkillSafetyScore');
const activeSkillDesc = document.getElementById('activeSkillDesc');
const toolCountLabel = document.getElementById('toolCountLabel');
const capabilitiesGrid = document.getElementById('capabilitiesGrid');

// Test Bench
const benchToolSelect = document.getElementById('benchToolSelect');
const benchSafeBtn = document.getElementById('benchSafeBtn');
const benchExploitBtn = document.getElementById('benchExploitBtn');
const benchStatusPill = document.getElementById('benchStatusPill');
const benchLatency = document.getElementById('benchLatency');
const benchOutputText = document.getElementById('benchOutputText');

// Inspector Elements
const downloadBundleBtn = document.getElementById('downloadBundleBtn');
const mcpConfigSnippet = document.getElementById('mcpConfigSnippet');
const cursorRulesSnippet = document.getElementById('cursorRulesSnippet');
const antigravitySnippet = document.getElementById('antigravitySnippet');
const openaiSnippet = document.getElementById('openaiSnippet');
const developerRawIr = document.getElementById('developerRawIr');

// Modal Elements
const openCreateModalBtn = document.getElementById('openCreateModalBtn');
const createModalOverlay = document.getElementById('createModalOverlay');
const closeCreateModalBtn = document.getElementById('closeCreateModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const generateSkillSubmitBtn = document.getElementById('generateSkillSubmitBtn');
const modalPromptInput = document.getElementById('modalPromptInput');
const modalEngineSelect = document.getElementById('modalEngineSelect');
const modalApiKeyGroup = document.getElementById('modalApiKeyGroup');
const modalApiKeyInput = document.getElementById('modalApiKeyInput');
const refineSkillBtn = document.getElementById('refineSkillBtn');
const chipItems = document.querySelectorAll('.chip-item');

// 1. Initialize
async function init() {
  try {
    const res = await fetch('/api/presets');
    currentPresets = await res.json();
    
    // Add UI/UX Design as 4th template
    currentPresets['ui-ux-design'] = {
      filename: 'ui-ux-design.yaml',
      description: 'Review screens against Apple HIG, check WCAG color contrast, and generate structured critique reports.',
      isNatural: true,
      prompt: 'UI/UX design reviewer that reviews screens against Apple HIG, checks WCAG color contrast, and suggests semantic layout refinements.'
    };

    loadSkill('stripe-billing');
  } catch (err) {
    console.error('Failed to load presets:', err);
  }
}

// 2. Load Skill
async function loadSkill(skillId) {
  activeSkillId = skillId;

  // Update sidebar active states
  document.querySelectorAll('.nav-item').forEach(item => {
    if (item.dataset.skill === skillId) item.classList.add('active');
    else item.classList.remove('active');
  });

  const preset = currentPresets[skillId];
  if (preset) {
    if (preset.isNatural) {
      await synthesizeFromPrompt(preset.prompt);
    } else {
      await compileFromSource(preset.source, preset.filename);
    }
    return;
  }

  // Check custom skills
  const custom = customSkills.find(c => c.id === skillId);
  if (custom) {
    await synthesizeFromPrompt(custom.prompt);
  }
}

// Sidebar Nav Click Handlers
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    loadSkill(item.dataset.skill);
  });
});

// 3. Compile from Source
async function compileFromSource(source, filename) {
  try {
    const res = await fetch('/api/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source, filename, harden: true, targets: ['all'] })
    });
    currentCompilation = await res.json();
    renderActiveSkill();
  } catch (err) {
    console.error('Compile error:', err);
  }
}

// 4. Synthesize from Prompt
async function synthesizeFromPrompt(prompt, provider = 'builtin', apiKey = undefined) {
  try {
    const res = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, provider, apiKey, targets: ['all'] })
    });
    currentCompilation = await res.json();
    renderActiveSkill();
  } catch (err) {
    console.error('Synthesis error:', err);
  }
}

// 5. Render Active Skill into Canvas & Inspector
function renderActiveSkill() {
  if (!currentCompilation) return;
  const { ir, auditReport, targetFiles } = currentCompilation;

  // Canvas Header
  activeSkillTitle.textContent = ir.displayName;
  activeSkillDesc.textContent = ir.description;
  activeSkillCategoryBadge.textContent = ir.category.replace('_', ' ').toUpperCase();
  
  const score = auditReport.safetyScore;
  activeSkillSafetyScore.textContent = `${score}% Protected`;

  // Capabilities Grid
  toolCountLabel.textContent = `${ir.tools.length} capabilities ready`;
  capabilitiesGrid.innerHTML = '';
  benchToolSelect.innerHTML = '';

  ir.tools.forEach(tool => {
    // Card
    const card = document.createElement('div');
    card.className = 'cap-card';

    let riskClass = 'read';
    let riskLabel = 'Safe (Read-only)';
    if (tool.riskLevel === 'destructive_write') {
      riskClass = 'destructive';
      riskLabel = 'Requires Confirmation';
    } else if (tool.riskLevel === 'idempotent_write') {
      riskClass = 'write';
      riskLabel = 'Can Modify State';
    }

    card.innerHTML = `
      <div class="cap-card-header">
        <span class="cap-card-name">${tool.name}</span>
        <span class="risk-tag ${riskClass}">${riskLabel}</span>
      </div>
      <p class="cap-card-desc">${tool.description}</p>
    `;
    capabilitiesGrid.appendChild(card);

    // Bench select option
    const opt = document.createElement('option');
    opt.value = tool.name;
    opt.textContent = `${tool.name} (${riskLabel})`;
    benchToolSelect.appendChild(opt);
  });

  // Inspector Snippets
  const name = ir.name;
  
  // MCP snippet
  const mcpFile = targetFiles[`mcp/${name}/claude_desktop_config.json`];
  mcpConfigSnippet.textContent = mcpFile ? mcpFile.slice(0, 150) + '...' : 'Available';

  // Cursor snippet
  const cursorFile = targetFiles[`cursor/${name}/.cursorrules`];
  cursorRulesSnippet.textContent = cursorFile ? cursorFile.slice(0, 150) + '...' : 'Available';

  // Antigravity snippet
  const antigravityFile = targetFiles[`skills/${name}/SKILL.md`];
  antigravitySnippet.textContent = antigravityFile ? antigravityFile.slice(0, 150) + '...' : 'Available';

  // OpenAI snippet
  const openaiFile = targetFiles[`api-tools/${name}/openai-tools.json`];
  openaiSnippet.textContent = openaiFile ? openaiFile.slice(0, 150) + '...' : 'Available';

  // Developer Raw IR
  developerRawIr.textContent = JSON.stringify(ir, null, 2);
}

// 6. Copy Buttons on Inspector Cards
document.querySelectorAll('.btn-copy-card').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!currentCompilation) return;
    const type = btn.dataset.copy;
    const name = currentCompilation.ir.name;
    const files = currentCompilation.targetFiles;
    
    let contentToCopy = '';
    if (type === 'mcp') contentToCopy = files[`mcp/${name}/claude_desktop_config.json`] || files[`mcp/${name}/mcp-server.mjs`];
    else if (type === 'cursor') contentToCopy = files[`cursor/${name}/.cursorrules`];
    else if (type === 'antigravity') contentToCopy = files[`skills/${name}/SKILL.md`];
    else if (type === 'openai') contentToCopy = files[`api-tools/${name}/openai-tools.json`];

    if (contentToCopy) {
      navigator.clipboard.writeText(contentToCopy);
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      btn.style.color = '#10b981';
      setTimeout(() => {
        btn.textContent = originalText;
        btn.style.color = '';
      }, 1500);
    }
  });
});

// 7. Download Complete Skill Bundle (.zip or combined bundle)
downloadBundleBtn.addEventListener('click', () => {
  if (!currentCompilation) return;
  const { ir, targetFiles } = currentCompilation;

  // Create combined markdown package
  let bundleContent = `# ${ir.displayName} Complete Skill Package\n\n`;
  for (const [filePath, content] of Object.entries(targetFiles)) {
    bundleContent += `\n\n<!-- FILE: ${filePath} -->\n` + content;
  }

  const blob = new Blob([bundleContent], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${ir.name}-skill-bundle.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});

// 8. Test Bench Execution
async function runBenchSimulation(isExploit) {
  if (!currentCompilation) return;
  const toolName = benchToolSelect.value;
  const tool = currentCompilation.ir.tools.find(t => t.name === toolName);

  const args = {};
  for (const [pName, pDef] of Object.entries(tool?.parameters?.properties || {})) {
    if (pDef.type === 'string') args[pName] = isExploit ? '../../etc/shadow' : `sample_${pName}`;
    else if (pDef.type === 'integer' || pDef.type === 'number') args[pName] = 100;
    else if (pDef.type === 'boolean') args[pName] = true;
  }

  if (isExploit) {
    args.dryRun = false;
    args.confirm = false;
  } else {
    args.dryRun = true;
    args.confirm = true;
  }

  benchStatusPill.textContent = 'Testing...';
  benchStatusPill.className = 'bench-pill ready';

  try {
    const res = await fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ir: currentCompilation.ir,
        toolName,
        args
      })
    });

    const result = await res.json();
    benchLatency.textContent = `${Number(result.durationMs).toFixed(1)}ms`;

    if (result.guardrailBlocked) {
      benchStatusPill.textContent = 'THREAT BLOCKED';
      benchStatusPill.className = 'bench-pill blocked';
      benchOutputText.textContent = `🛡️ SECURITY SHIELD TRIGGERED:\n${result.blockReason}\n\nThe agent input was blocked before reaching the system.`;
    } else if (!result.success) {
      benchStatusPill.textContent = 'ERROR';
      benchStatusPill.className = 'bench-pill blocked';
      benchOutputText.textContent = `Execution Failed: ${result.blockReason}`;
    } else {
      benchStatusPill.textContent = 'VERIFIED SAFE';
      benchStatusPill.className = 'bench-pill success';
      benchOutputText.textContent = `✔ SAFE SIMULATION SUCCEEDED:\nExecuted ${result.toolName} with 0 unverified state modifications.\n\nResponse: ${result.output?.simulatedResponse?.message || 'Operation verified'}`;
    }
  } catch (err) {
    benchOutputText.textContent = 'Network error: ' + err.message;
  }
}

benchSafeBtn.addEventListener('click', () => runBenchSimulation(false));
benchExploitBtn.addEventListener('click', () => runBenchSimulation(true));

// 9. Modal Handlers
openCreateModalBtn.addEventListener('click', () => {
  createModalOverlay.style.display = 'flex';
  modalPromptInput.focus();
});

function closeModal() {
  createModalOverlay.style.display = 'none';
}

closeCreateModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);

modalEngineSelect.addEventListener('change', () => {
  const eng = modalEngineSelect.value;
  modalApiKeyGroup.style.display = (eng === 'gemini' || eng === 'openai') ? 'flex' : 'none';
});

chipItems.forEach(chip => {
  chip.addEventListener('click', () => {
    modalPromptInput.value = chip.dataset.prompt;
    modalPromptInput.focus();
  });
});

refineSkillBtn.addEventListener('click', () => {
  createModalOverlay.style.display = 'flex';
  modalPromptInput.value = currentCompilation?.ir?.description || '';
  modalPromptInput.focus();
});

generateSkillSubmitBtn.addEventListener('click', async () => {
  const prompt = modalPromptInput.value.trim();
  if (!prompt) return;

  generateSkillSubmitBtn.disabled = true;
  generateSkillSubmitBtn.innerHTML = '<span>Synthesizing...</span>';

  const provider = modalEngineSelect.value;
  const apiKey = modalApiKeyInput.value.trim() || undefined;

  try {
    const res = await fetch('/api/synthesize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, provider, apiKey, targets: ['all'] })
    });

    currentCompilation = await res.json();
    
    // Add to custom skills sidebar
    const skillId = 'custom-' + Date.now();
    customSkills.unshift({
      id: skillId,
      name: currentCompilation.ir.displayName,
      prompt: prompt
    });

    // Re-render sidebar custom skills
    renderCustomSkillsSidebar();

    closeModal();
    activeSkillId = skillId;
    renderActiveSkill();
  } catch (err) {
    alert('Failed to synthesize: ' + err.message);
  } finally {
    generateSkillSubmitBtn.disabled = false;
    generateSkillSubmitBtn.innerHTML = '<span>Synthesize Skill</span>';
  }
});

function renderCustomSkillsSidebar() {
  customSkillsList.innerHTML = '';
  customSkills.forEach(skill => {
    const btn = document.createElement('button');
    btn.className = 'nav-item' + (skill.id === activeSkillId ? ' active' : '');
    btn.dataset.skill = skill.id;
    btn.innerHTML = `
      <span class="nav-item-icon">✨</span>
      <div class="nav-item-text">
        <span class="nav-item-title">${skill.name}</span>
        <span class="nav-item-sub">Custom Skill</span>
      </div>
    `;
    btn.addEventListener('click', () => loadSkill(skill.id));
    customSkillsList.appendChild(btn);
  });
}


// Copy Bare .md Button Handlers
const copyBareMdBtn = document.getElementById('copyBareMdBtn');
const copyBareMdQuickBtn = document.getElementById('copyBareMdQuickBtn');

function copyBareMarkdown(btnElement) {
  if (!currentCompilation) return;
  const name = currentCompilation.ir.name;
  const files = currentCompilation.targetFiles;
  
  // Get raw SKILL.md content
  const skillMdContent = files[`skills/${name}/SKILL.md`] || '';
  if (!skillMdContent) {
    alert('SKILL.md not found in compilation.');
    return;
  }

  navigator.clipboard.writeText(skillMdContent);

  // Visual feedback
  const originalHtml = btnElement.innerHTML;
  btnElement.classList.add('copied');
  btnElement.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
    <span>Copied .md!</span>
  `;

  setTimeout(() => {
    btnElement.classList.remove('copied');
    btnElement.innerHTML = originalHtml;
  }, 1800);
}

if (copyBareMdBtn) {
  copyBareMdBtn.addEventListener('click', () => copyBareMarkdown(copyBareMdBtn));
}

if (copyBareMdQuickBtn) {
  copyBareMdQuickBtn.addEventListener('click', () => copyBareMarkdown(copyBareMdQuickBtn));
}

// Run
init();
