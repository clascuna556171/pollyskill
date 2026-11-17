// PolySkill Studio Client
const STORAGE_KEY_CUSTOM_SKILLS = 'polyskill.customSkills.v1';
const STORAGE_KEY_GUIDE_HIDDEN = 'polyskill.guideHidden.v1';

let currentCompilation = null;
let currentPresets = {};
let customSkills = loadStoredCustomSkills();
let activeSkillId = 'stripe-billing';
let activeCreateTab = 'describe';
let activePreviewContent = '';

const CODE_SAMPLES = {
  python: {
    filename: 'cleanup_ops.py',
    source: `"""
Server Log & Cache Maintenance CLI
"""

def inspect_disk_usage(target_dir: str = "./logs") -> str:
    """
    Inspect log directory size before cleanup.
    :param target_dir: Directory path to scan
    """
    return f"Scanned {target_dir}"

def purge_old_logs(target_dir: str, retention_days: int = 14) -> bool:
    """
    Permanently delete archived logs older than retention_days.
    :param target_dir: Directory containing archived logs
    :param retention_days: Minimum age in days before removal
    """
    return True
`
  },
  openapi: {
    filename: 'inventory_api.json',
    source: JSON.stringify({
      openapi: '3.0.0',
      info: {
        title: 'Warehouse Inventory API',
        version: '1.0.0',
        description: 'Inspect stock counts and reserve or purge warehouse SKUs.'
      },
      paths: {
        '/items/{sku}': {
          get: {
            operationId: 'get_item_stock',
            summary: 'Check available stock count for a SKU',
            parameters: [
              { name: 'sku', in: 'path', required: true, description: 'Product SKU identifier', schema: { type: 'string' } }
            ]
          },
          delete: {
            operationId: 'delete_sku_record',
            summary: 'Permanently delete a discontinued SKU record',
            parameters: [
              { name: 'sku', in: 'path', required: true, description: 'Product SKU to delete', schema: { type: 'string' } }
            ]
          }
        }
      }
    }, null, 2)
  },
  bash: {
    filename: 'docker_prune.sh',
    source: `#!/usr/bin/env bash
# Prune unused Docker containers and images safely
while getopts "a:d:" opt; do
  case $opt in
    a) age_hours="$OPTARG" ;;
    d) dry_run="$OPTARG" ;;
  esac
done
echo "Pruning containers older than \${age_hours:-24}h"
`
  }
};

// DOM Elements
const customSkillsList = document.getElementById('customSkillsList');
const customSkillCount = document.getElementById('customSkillCount');
const activeSkillTitle = document.getElementById('activeSkillTitle');
const activeSkillSourceBadge = document.getElementById('activeSkillSourceBadge');
const activeSkillCategoryBadge = document.getElementById('activeSkillCategoryBadge');
const activeSkillSafetyScore = document.getElementById('activeSkillSafetyScore');
const activeSkillDesc = document.getElementById('activeSkillDesc');
const toolCountLabel = document.getElementById('toolCountLabel');
const capabilitiesGrid = document.getElementById('capabilitiesGrid');
const auditSummaryLabel = document.getElementById('auditSummaryLabel');
const auditFindingsBanner = document.getElementById('auditFindingsBanner');

// Workflow Step Bar & Quick-Start Guide
const stepCreateBtn = document.getElementById('stepCreateBtn');
const stepReviewBtn = document.getElementById('stepReviewBtn');
const stepDeployBtn = document.getElementById('stepDeployBtn');
const showGuideBtn = document.getElementById('showGuideBtn');
const quickStartBanner = document.getElementById('quickStartBanner');
const qsDescribeBtn = document.getElementById('qsDescribeBtn');
const qsCodeBtn = document.getElementById('qsCodeBtn');
const qsDismissBtn = document.getElementById('qsDismissBtn');

// Inline Skill Editor
const toggleEditSkillBtn = document.getElementById('toggleEditSkillBtn');
const closeInlineEditorBtn = document.getElementById('closeInlineEditorBtn');
const inlineEditorPanel = document.getElementById('inlineEditorPanel');
const editDisplayName = document.getElementById('editDisplayName');
const editCategory = document.getElementById('editCategory');
const editDescription = document.getElementById('editDescription');
const editWorkflow = document.getElementById('editWorkflow');
const saveInlineEditsBtn = document.getElementById('saveInlineEditsBtn');
const editorStatusMsg = document.getElementById('editorStatusMsg');

// Test Bench
const benchToolSelect = document.getElementById('benchToolSelect');
const benchSafeBtn = document.getElementById('benchSafeBtn');
const benchExploitBtn = document.getElementById('benchExploitBtn');
const benchSecretBtn = document.getElementById('benchSecretBtn');
const benchStatusPill = document.getElementById('benchStatusPill');
const benchLatency = document.getElementById('benchLatency');
const benchOutputText = document.getElementById('benchOutputText');

// Inspector Elements
const copyBareMdQuickBtn = document.getElementById('copyBareMdQuickBtn');
const downloadBundleBtn = document.getElementById('downloadBundleBtn');
const mcpConfigSnippet = document.getElementById('mcpConfigSnippet');
const cursorRulesSnippet = document.getElementById('cursorRulesSnippet');
const antigravitySnippet = document.getElementById('antigravitySnippet');
const openaiSnippet = document.getElementById('openaiSnippet');
const developerRawIr = document.getElementById('developerRawIr');
const previewInstallBtn = document.getElementById('previewInstallBtn');
const runInstallBtn = document.getElementById('runInstallBtn');
const installResultLog = document.getElementById('installResultLog');

// Create Modal Elements
const openCreateModalBtn = document.getElementById('openCreateModalBtn');
const createModalOverlay = document.getElementById('createModalOverlay');
const closeCreateModalBtn = document.getElementById('closeCreateModalBtn');
const cancelModalBtn = document.getElementById('cancelModalBtn');
const generateSkillSubmitBtn = document.getElementById('generateSkillSubmitBtn');
const modalCustomNameInput = document.getElementById('modalCustomNameInput');
const modalPromptInput = document.getElementById('modalPromptInput');
const modalEngineSelect = document.getElementById('modalEngineSelect');
const modalApiKeyGroup = document.getElementById('modalApiKeyGroup');
const modalApiKeyInput = document.getElementById('modalApiKeyInput');
const modalFilenameInput = document.getElementById('modalFilenameInput');
const modalCodeInput = document.getElementById('modalCodeInput');
const codeFileInput = document.getElementById('codeFileInput');
const detectedFormatPill = document.getElementById('detectedFormatPill');
const modalErrorBanner = document.getElementById('modalErrorBanner');
const refineSkillBtn = document.getElementById('refineSkillBtn');

// Preview Modal Elements
const previewModalOverlay = document.getElementById('previewModalOverlay');
const previewModalTitle = document.getElementById('previewModalTitle');
const previewModalPath = document.getElementById('previewModalPath');
const previewModalCode = document.getElementById('previewModalCode');
const closePreviewModalBtn = document.getElementById('closePreviewModalBtn');
const donePreviewModalBtn = document.getElementById('donePreviewModalBtn');
const copyPreviewCodeBtn = document.getElementById('copyPreviewCodeBtn');

function loadStoredCustomSkills() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_SKILLS);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredCustomSkills() {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_SKILLS, JSON.stringify(customSkills));
  } catch {
    // Ignore storage quota errors
  }
}

function setWorkflowStep(step) {
  [stepCreateBtn, stepReviewBtn, stepDeployBtn].forEach(btn => btn.classList.remove('active'));
  if (step === 'create') stepCreateBtn.classList.add('active');
  else if (step === 'deploy') stepDeployBtn.classList.add('active');
  else stepReviewBtn.classList.add('active');
}

function applyGuideVisibility() {
  const hidden = localStorage.getItem(STORAGE_KEY_GUIDE_HIDDEN) === 'true';
  quickStartBanner.hidden = hidden;
  showGuideBtn.textContent = hidden ? 'Show guide' : 'Hide guide';
}

// 1. Initialize
async function init() {
  applyGuideVisibility();
  renderCustomSkillsSidebar();

  try {
    const res = await fetch('/api/presets');
    currentPresets = await res.json();

    currentPresets['ui-ux-design'] = {
      filename: 'ui-ux-design.yaml',
      description: 'Review screens against Apple HIG, check WCAG color contrast, and generate structured critique reports.',
      isNatural: true,
      prompt: 'UI/UX design reviewer that reviews screens against Apple HIG, checks WCAG color contrast, and suggests semantic layout refinements.'
    };

    if (customSkills.length > 0) {
      await loadSkill(customSkills[0].id);
    } else {
      await loadSkill('stripe-billing');
    }
  } catch (err) {
    console.error('Failed to load presets:', err);
  }
}

// 2. Load Skill (template or persisted custom skill)
async function loadSkill(skillId) {
  activeSkillId = skillId;
  inlineEditorPanel.hidden = true;
  installResultLog.hidden = true;

  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.skill === skillId);
  });

  const preset = currentPresets[skillId];
  if (preset) {
    if (preset.isNatural) {
      await synthesizeFromPrompt(preset.prompt);
    } else {
      await compileFromSource(preset.source, preset.filename);
    }
    setWorkflowStep('review');
    return;
  }

  const custom = customSkills.find(c => c.id === skillId);
  if (custom) {
    if (custom.ir) {
      await recompileSkillIR(custom.ir);
    } else if (custom.source) {
      await compileFromSource(custom.source, custom.filename || 'custom.spec');
    } else if (custom.prompt) {
      await synthesizeFromPrompt(custom.prompt, 'builtin', undefined, custom.name);
    }
    setWorkflowStep('review');
  }
}

document.querySelectorAll('#templateNavList .nav-item').forEach(item => {
  item.addEventListener('click', () => loadSkill(item.dataset.skill));
});

// 3. Compile / Synthesize / Recompile APIs
async function compileFromSource(source, filename) {
  const res = await fetch('/api/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source, filename, harden: true, targets: ['all'] })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Compilation failed');
  currentCompilation = data;
  renderActiveSkill();
  return data;
}

async function synthesizeFromPrompt(prompt, provider = 'builtin', apiKey = undefined, name = undefined) {
  const res = await fetch('/api/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, name, provider, apiKey, targets: ['all'] })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Synthesis failed');
  currentCompilation = data;
  renderActiveSkill();
  return data;
}

async function recompileSkillIR(ir) {
  const res = await fetch('/api/recompile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ir, targets: ['all'] })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Recompilation failed');
  currentCompilation = data;
  renderActiveSkill();
  return data;
}

// 4. Render Active Skill
function renderActiveSkill() {
  if (!currentCompilation) return;
  const { ir, auditReport, targetFiles } = currentCompilation;

  activeSkillTitle.textContent = ir.displayName;
  activeSkillDesc.textContent = ir.description;
  activeSkillSourceBadge.textContent = (ir.metadata?.sourceType || 'skillspec').toUpperCase();
  activeSkillCategoryBadge.textContent = ir.category.replace('_', ' ').toUpperCase();

  const score = auditReport.safetyScore;
  activeSkillSafetyScore.textContent = `${score}% Protected`;
  activeSkillSafetyScore.className = 'score-pill' + (score < 70 ? ' danger' : (score < 90 ? ' warn' : ''));

  // Populate inline editor fields
  editDisplayName.value = ir.displayName;
  editCategory.value = ir.category;
  editDescription.value = ir.description;
  editWorkflow.value = ir.workflowInstructions || '';

  // Audit summary & findings
  if (auditReport.findings && auditReport.findings.length > 0) {
    auditSummaryLabel.textContent = `${auditReport.findings.length} audit note(s) detected`;
    auditFindingsBanner.hidden = false;
    auditFindingsBanner.textContent = auditReport.findings
      .map(f => `[${f.severity.toUpperCase()}] ${f.rule}: ${f.message}`)
      .join(' | ');
  } else {
    auditSummaryLabel.textContent = 'All deterministic checks enforced';
    auditFindingsBanner.hidden = true;
    auditFindingsBanner.textContent = '';
  }

  // Capabilities Grid
  toolCountLabel.textContent = `${ir.tools.length} capabilities ready`;
  capabilitiesGrid.innerHTML = '';
  benchToolSelect.innerHTML = '';

  ir.tools.forEach((tool, toolIdx) => {
    const card = document.createElement('div');
    card.className = 'cap-card';

    let riskClass = 'read';
    let riskLabel = 'Safe (Read-only)';
    if (tool.riskLevel === 'destructive_write' || tool.riskLevel === 'privileged') {
      riskClass = 'destructive';
      riskLabel = 'Destructive — Confirm Gate';
    } else if (tool.riskLevel === 'idempotent_write') {
      riskClass = 'write';
      riskLabel = 'Modifies State';
    }

    const header = document.createElement('div');
    header.className = 'cap-card-header';

    const nameEl = document.createElement('span');
    nameEl.className = 'cap-card-name';
    nameEl.textContent = tool.name;

    const riskEl = document.createElement('span');
    riskEl.className = `risk-tag ${riskClass}`;
    riskEl.textContent = riskLabel;

    header.append(nameEl, riskEl);

    const descEl = document.createElement('p');
    descEl.className = 'cap-card-desc';
    descEl.textContent = tool.description;

    const metaRow = document.createElement('div');
    metaRow.className = 'cap-card-meta-row';

    const paramsRow = document.createElement('div');
    paramsRow.className = 'cap-params-row';
    const propKeys = Object.keys(tool.parameters?.properties || {});
    if (propKeys.length === 0) {
      const emptyChip = document.createElement('span');
      emptyChip.className = 'param-chip';
      emptyChip.textContent = 'no params';
      paramsRow.appendChild(emptyChip);
    } else {
      propKeys.forEach(pName => {
        const chip = document.createElement('span');
        const isGuardrail = pName === 'dryRun' || pName === 'confirm';
        chip.className = 'param-chip' + (isGuardrail ? ' guardrail' : '');
        chip.textContent = isGuardrail ? `${pName} (guardrail)` : pName;
        paramsRow.appendChild(chip);
      });
    }

    const riskSelect = document.createElement('select');
    riskSelect.className = 'cap-risk-select';
    riskSelect.setAttribute('aria-label', `Risk level for ${tool.name}`);
    [
      ['read_only', 'Read-only'],
      ['idempotent_write', 'Write'],
      ['destructive_write', 'Destructive']
    ].forEach(([val, label]) => {
      const option = document.createElement('option');
      option.value = val;
      option.textContent = label;
      option.selected = tool.riskLevel === val;
      riskSelect.appendChild(option);
    });
    riskSelect.addEventListener('change', async () => {
      currentCompilation.ir.tools[toolIdx].riskLevel = riskSelect.value;
      try {
        await recompileSkillIR(currentCompilation.ir);
        persistUpdatedCustomSkill();
      } catch (err) {
        console.error(err);
      }
    });

    metaRow.append(paramsRow, riskSelect);
    card.append(header, descEl, metaRow);
    capabilitiesGrid.appendChild(card);

    const opt = document.createElement('option');
    opt.value = tool.name;
    opt.textContent = `${tool.name} (${riskLabel})`;
    benchToolSelect.appendChild(opt);
  });

  // Inspector Snippets
  const name = ir.name;
  const mcpFile = targetFiles[`mcp/${name}/claude_desktop_config.json`];
  mcpConfigSnippet.textContent = mcpFile ? mcpFile.slice(0, 140) + '...' : 'Available';

  const cursorFile = targetFiles[`cursor/${name}/.cursorrules`];
  cursorRulesSnippet.textContent = cursorFile ? cursorFile.slice(0, 140) + '...' : 'Available';

  const antigravityFile = targetFiles[`skills/${name}/SKILL.md`];
  antigravitySnippet.textContent = antigravityFile ? antigravityFile.slice(0, 140) + '...' : 'Available';

  const openaiFile = targetFiles[`api-tools/${name}/openai-tools.json`];
  openaiSnippet.textContent = openaiFile ? openaiFile.slice(0, 140) + '...' : 'Available';

  developerRawIr.textContent = JSON.stringify(ir, null, 2);
}

function persistUpdatedCustomSkill() {
  const custom = customSkills.find(c => c.id === activeSkillId);
  if (custom && currentCompilation) {
    custom.name = currentCompilation.ir.displayName;
    custom.ir = currentCompilation.ir;
    saveStoredCustomSkills();
    renderCustomSkillsSidebar();
  }
}

// 5. Inline Skill Metadata Editor
toggleEditSkillBtn.addEventListener('click', () => {
  inlineEditorPanel.hidden = !inlineEditorPanel.hidden;
  editorStatusMsg.textContent = '';
  if (!inlineEditorPanel.hidden) {
    editDisplayName.focus();
  }
});

closeInlineEditorBtn.addEventListener('click', () => {
  inlineEditorPanel.hidden = true;
});

saveInlineEditsBtn.addEventListener('click', async () => {
  if (!currentCompilation) return;
  const nextName = editDisplayName.value.trim();
  if (!nextName) {
    editorStatusMsg.textContent = 'Display name cannot be empty.';
    return;
  }

  const updatedIr = {
    ...currentCompilation.ir,
    displayName: nextName,
    name: nextName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || currentCompilation.ir.name,
    category: editCategory.value,
    description: editDescription.value.trim() || currentCompilation.ir.description,
    workflowInstructions: editWorkflow.value
  };

  saveInlineEditsBtn.disabled = true;
  try {
    await recompileSkillIR(updatedIr);
    persistUpdatedCustomSkill();
    editorStatusMsg.textContent = 'Recompiled and updated all export targets.';
  } catch (err) {
    editorStatusMsg.textContent = err.message;
  } finally {
    saveInlineEditsBtn.disabled = false;
  }
});

// 6. Export Copy, Preview & Genuine ZIP Bundle
function resolveArtifactEntry(type) {
  if (!currentCompilation) return null;
  const name = currentCompilation.ir.name;
  const files = currentCompilation.targetFiles;
  if (type === 'mcp') {
    const key = files[`mcp/${name}/claude_desktop_config.json`] ? `mcp/${name}/claude_desktop_config.json` : `mcp/${name}/mcp-server.mjs`;
    return { path: key, content: files[key] || '' };
  }
  if (type === 'cursor') {
    const key = `cursor/${name}/.cursorrules`;
    return { path: key, content: files[key] || '' };
  }
  if (type === 'antigravity') {
    const key = `skills/${name}/SKILL.md`;
    return { path: key, content: files[key] || '' };
  }
  if (type === 'openai') {
    const key = `api-tools/${name}/openai-tools.json`;
    return { path: key, content: files[key] || '' };
  }
  return null;
}

document.querySelectorAll('.btn-copy-card').forEach(btn => {
  btn.addEventListener('click', async () => {
    const entry = resolveArtifactEntry(btn.dataset.copy);
    if (!entry || !entry.content) return;
    await navigator.clipboard.writeText(entry.content);
    const originalText = btn.textContent;
    btn.textContent = 'Copied!';
    btn.style.color = '#10b981';
    setWorkflowStep('deploy');
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.color = '';
    }, 1500);
  });
});

document.querySelectorAll('.btn-preview-card').forEach(btn => {
  btn.addEventListener('click', () => {
    const entry = resolveArtifactEntry(btn.dataset.preview);
    if (!entry) return;
    activePreviewContent = entry.content;
    previewModalTitle.textContent = `${currentCompilation.ir.displayName} — Artifact Preview`;
    previewModalPath.textContent = entry.path;
    previewModalCode.textContent = entry.content || 'Not generated for current targets.';
    previewModalOverlay.hidden = false;
    setWorkflowStep('deploy');
  });
});

function closePreviewModal() {
  previewModalOverlay.hidden = true;
}
closePreviewModalBtn.addEventListener('click', closePreviewModal);
donePreviewModalBtn.addEventListener('click', closePreviewModal);
copyPreviewCodeBtn.addEventListener('click', async () => {
  if (!activePreviewContent) return;
  await navigator.clipboard.writeText(activePreviewContent);
  copyPreviewCodeBtn.textContent = 'Copied!';
  setTimeout(() => {
    copyPreviewCodeBtn.textContent = 'Copy File Contents';
  }, 1500);
});

downloadBundleBtn.addEventListener('click', async () => {
  if (!currentCompilation) return;
  const { ir, targetFiles } = currentCompilation;
  downloadBundleBtn.disabled = true;
  try {
    const res = await fetch('/api/bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: ir.name, targetFiles })
    });
    if (!res.ok) {
      const errData = await res.json();
      throw new Error(errData.error || 'Bundle download failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${ir.name}-skill-bundle.zip`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setWorkflowStep('deploy');
  } catch (err) {
    installResultLog.hidden = false;
    installResultLog.textContent = `Download error: ${err.message}`;
  } finally {
    downloadBundleBtn.disabled = false;
  }
});

// Local Agent Installer
async function triggerInstall(dryRun) {
  if (!currentCompilation) return;
  const checked = Array.from(document.querySelectorAll('.install-check input:checked')).map(el => el.value);
  if (checked.length === 0) {
    installResultLog.hidden = false;
    installResultLog.textContent = 'Select at least one target above (Antigravity, Claude MCP, or Cursor).';
    return;
  }

  installResultLog.hidden = false;
  installResultLog.textContent = dryRun ? 'Previewing target paths...' : 'Installing skill locally...';

  try {
    const res = await fetch('/api/install', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ir: currentCompilation.ir,
        targets: checked,
        scope: 'global',
        dryRun
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Install failed');

    const lines = data.installedItems.map(
      item => `${item.status === 'simulated' ? '[PREVIEW]' : '[MOUNTED]'} ${item.target.toUpperCase()}: ${item.path}`
    );
    if (data.warnings && data.warnings.length > 0) {
      lines.push(...data.warnings.map(w => `[WARN] ${w}`));
    }
    installResultLog.textContent = lines.join('\n') || 'No items processed.';
    setWorkflowStep('deploy');
  } catch (err) {
    installResultLog.textContent = `Install failed: ${err.message}`;
  }
}

previewInstallBtn.addEventListener('click', () => triggerInstall(true));
runInstallBtn.addEventListener('click', () => triggerInstall(false));

// 7. Test Bench Execution
async function runBenchSimulation(mode) {
  if (!currentCompilation) return;
  const toolName = benchToolSelect.value;
  const tool = currentCompilation.ir.tools.find(t => t.name === toolName);

  const args = {};
  for (const [pName, pDef] of Object.entries(tool?.parameters?.properties || {})) {
    if (pDef.type === 'string') {
      if (mode === 'traversal') args[pName] = '../../etc/shadow';
      else if (mode === 'credential') args[pName] = 'sk-live-9876543210abcdefghijklmnopqrstuvwxyz';
      else args[pName] = `sample_${pName}`;
    } else if (pDef.type === 'integer' || pDef.type === 'number') {
      args[pName] = 100;
    } else if (pDef.type === 'boolean') {
      args[pName] = true;
    }
  }

  if (mode === 'traversal' || mode === 'credential') {
    args.dryRun = false;
    args.confirm = false;
  } else {
    args.dryRun = true;
    args.confirm = true;
  }

  benchStatusPill.textContent = 'Testing...';
  benchStatusPill.className = 'bench-pill ready';
  setWorkflowStep('review');

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
    benchLatency.textContent = `${Number(result.durationMs || 0).toFixed(1)}ms`;

    if (result.guardrailBlocked) {
      benchStatusPill.textContent = 'THREAT BLOCKED';
      benchStatusPill.className = 'bench-pill blocked';
      benchOutputText.textContent = `SECURITY SHIELD TRIGGERED:\n${result.blockReason}\n\nThe unsafe input was blocked before execution.`;
    } else if (!result.success) {
      benchStatusPill.textContent = 'ERROR';
      benchStatusPill.className = 'bench-pill blocked';
      benchOutputText.textContent = `Execution Failed: ${result.blockReason}`;
    } else {
      benchStatusPill.textContent = 'VERIFIED SAFE';
      benchStatusPill.className = 'bench-pill success';
      benchOutputText.textContent = `SAFE SIMULATION SUCCEEDED:\nExecuted ${result.toolName} with 0 unverified state modifications.\n\nResponse: ${result.output?.simulatedResponse?.message || 'Operation verified'}`;
    }
  } catch (err) {
    benchOutputText.textContent = 'Network error: ' + err.message;
  }
}

benchSafeBtn.addEventListener('click', () => runBenchSimulation('safe'));
benchExploitBtn.addEventListener('click', () => runBenchSimulation('traversal'));
benchSecretBtn.addEventListener('click', () => runBenchSimulation('credential'));

// 8. Unified Create Skill Modal (Tabs, Upload, Validation)
function setCreateTab(tabName) {
  activeCreateTab = tabName;
  modalErrorBanner.hidden = true;

  document.querySelectorAll('.modal-tab').forEach(tab => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });

  document.getElementById('tabPanelDescribe').hidden = tabName !== 'describe';
  document.getElementById('tabPanelCode').hidden = tabName !== 'code';
  document.getElementById('tabPanelTemplates').hidden = tabName !== 'templates';

  if (tabName === 'templates') {
    generateSkillSubmitBtn.hidden = true;
  } else {
    generateSkillSubmitBtn.hidden = false;
    generateSkillSubmitBtn.querySelector('span').textContent =
      tabName === 'code' ? 'Compile Code / Spec' : 'Synthesize Skill';
  }
}

function openCreateModal(tabName = 'describe') {
  setWorkflowStep('create');
  createModalOverlay.hidden = false;
  setCreateTab(tabName);
  if (tabName === 'describe') modalPromptInput.focus();
  else if (tabName === 'code') modalCodeInput.focus();
}

function closeModal() {
  createModalOverlay.hidden = true;
  modalErrorBanner.hidden = true;
}

function detectFormatLabel(filename, content) {
  const lowerName = (filename || '').toLowerCase();
  const trimmed = (content || '').trim();
  if (lowerName.endsWith('.sh') || lowerName.endsWith('.bash') || trimmed.startsWith('#!/')) {
    return 'Bash / Shell Script';
  }
  if (lowerName.endsWith('.py') || trimmed.includes('def ')) {
    return 'Python AST / Type Hints';
  }
  if (lowerName.endsWith('.ts') || lowerName.endsWith('.js') || trimmed.includes('export function')) {
    return 'TypeScript / JSDoc AST';
  }
  if (trimmed.startsWith('{') || lowerName.endsWith('.json')) {
    return trimmed.includes('"openapi"') || trimmed.includes('"paths"') ? 'OpenAPI v3 JSON' : 'JSON Spec';
  }
  if (lowerName.endsWith('.yaml') || lowerName.endsWith('.yml')) {
    return 'SkillSpec / OpenAPI YAML';
  }
  return 'Auto-detected Spec';
}

function updateDetectedFormat() {
  detectedFormatPill.textContent = detectFormatLabel(modalFilenameInput.value, modalCodeInput.value);
}

modalFilenameInput.addEventListener('input', updateDetectedFormat);
modalCodeInput.addEventListener('input', updateDetectedFormat);

document.querySelectorAll('.modal-tab').forEach(tab => {
  tab.addEventListener('click', () => setCreateTab(tab.dataset.tab));
});

openCreateModalBtn.addEventListener('click', () => openCreateModal('describe'));
qsDescribeBtn.addEventListener('click', () => openCreateModal('describe'));
qsCodeBtn.addEventListener('click', () => openCreateModal('code'));
qsDismissBtn.addEventListener('click', () => {
  localStorage.setItem(STORAGE_KEY_GUIDE_HIDDEN, 'true');
  applyGuideVisibility();
});
showGuideBtn.addEventListener('click', () => {
  const hidden = localStorage.getItem(STORAGE_KEY_GUIDE_HIDDEN) === 'true';
  localStorage.setItem(STORAGE_KEY_GUIDE_HIDDEN, String(!hidden));
  applyGuideVisibility();
});

stepCreateBtn.addEventListener('click', () => openCreateModal('describe'));
stepReviewBtn.addEventListener('click', () => {
  setWorkflowStep('review');
  document.getElementById('capabilitiesSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
});
stepDeployBtn.addEventListener('click', () => {
  setWorkflowStep('deploy');
  document.getElementById('deployInspector').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

closeCreateModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);

createModalOverlay.addEventListener('click', e => {
  if (e.target === createModalOverlay) closeModal();
});
previewModalOverlay.addEventListener('click', e => {
  if (e.target === previewModalOverlay) closePreviewModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!previewModalOverlay.hidden) closePreviewModal();
    else if (!createModalOverlay.hidden) closeModal();
  }
});

modalEngineSelect.addEventListener('change', () => {
  const eng = modalEngineSelect.value;
  modalApiKeyGroup.hidden = !(eng === 'gemini' || eng === 'openai');
});

document.querySelectorAll('#tabPanelDescribe .chip-item').forEach(chip => {
  chip.addEventListener('click', () => {
    modalPromptInput.value = chip.dataset.prompt || '';
    modalPromptInput.focus();
  });
});

document.querySelectorAll('.sample-code-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const sample = CODE_SAMPLES[btn.dataset.sample];
    if (!sample) return;
    modalFilenameInput.value = sample.filename;
    modalCodeInput.value = sample.source;
    updateDetectedFormat();
  });
});

codeFileInput.addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  modalFilenameInput.value = file.name;
  modalCodeInput.value = await file.text();
  updateDetectedFormat();
});

document.querySelectorAll('.template-pick-card').forEach(card => {
  card.addEventListener('click', async () => {
    const id = card.dataset.template;
    closeModal();
    await loadSkill(id);
  });
});

// Edit Source / Prompt restores the original custom prompt or preset source!
refineSkillBtn.addEventListener('click', () => {
  const custom = customSkills.find(c => c.id === activeSkillId);
  const preset = currentPresets[activeSkillId];

  if (custom?.source) {
    modalFilenameInput.value = custom.filename || 'custom.spec';
    modalCodeInput.value = custom.source;
    updateDetectedFormat();
    openCreateModal('code');
    return;
  }
  if (preset && !preset.isNatural && preset.source) {
    modalFilenameInput.value = preset.filename;
    modalCodeInput.value = preset.source;
    updateDetectedFormat();
    openCreateModal('code');
    return;
  }

  modalCustomNameInput.value = custom?.name || currentCompilation?.ir?.displayName || '';
  modalPromptInput.value = custom?.prompt || preset?.prompt || currentCompilation?.ir?.description || '';
  openCreateModal('describe');
});

generateSkillSubmitBtn.addEventListener('click', async () => {
  modalErrorBanner.hidden = true;
  const submitLabel = generateSkillSubmitBtn.querySelector('span');

  if (activeCreateTab === 'code') {
    const source = modalCodeInput.value.trim();
    const filename = modalFilenameInput.value.trim() || 'custom.spec';
    if (!source) {
      modalErrorBanner.hidden = false;
      modalErrorBanner.textContent = 'Paste code/spec or upload a file before compiling.';
      return;
    }

    generateSkillSubmitBtn.disabled = true;
    submitLabel.textContent = 'Compiling...';
    try {
      const compilation = await compileFromSource(source, filename);
      const skillId = 'custom-' + Date.now();
      customSkills.unshift({
        id: skillId,
        name: compilation.ir.displayName,
        source,
        filename,
        ir: compilation.ir
      });
      saveStoredCustomSkills();
      activeSkillId = skillId;
      renderCustomSkillsSidebar();
      closeModal();
      setWorkflowStep('review');
    } catch (err) {
      modalErrorBanner.hidden = false;
      modalErrorBanner.textContent = err.message;
    } finally {
      generateSkillSubmitBtn.disabled = false;
      submitLabel.textContent = 'Compile Code / Spec';
    }
    return;
  }

  const prompt = modalPromptInput.value.trim();
  if (!prompt) {
    modalErrorBanner.hidden = false;
    modalErrorBanner.textContent = 'Describe what the skill should do before synthesizing.';
    return;
  }

  const customName = modalCustomNameInput.value.trim() || undefined;
  const provider = modalEngineSelect.value;
  const apiKey = modalApiKeyInput.value.trim() || undefined;

  generateSkillSubmitBtn.disabled = true;
  submitLabel.textContent = 'Synthesizing...';
  try {
    const compilation = await synthesizeFromPrompt(prompt, provider, apiKey, customName);
    const skillId = 'custom-' + Date.now();
    customSkills.unshift({
      id: skillId,
      name: compilation.ir.displayName,
      prompt,
      ir: compilation.ir
    });
    saveStoredCustomSkills();
    activeSkillId = skillId;
    renderCustomSkillsSidebar();
    closeModal();
    setWorkflowStep('review');
  } catch (err) {
    modalErrorBanner.hidden = false;
    modalErrorBanner.textContent = err.message;
  } finally {
    generateSkillSubmitBtn.disabled = false;
    submitLabel.textContent = 'Synthesize Skill';
  }
});

function renderCustomSkillsSidebar() {
  customSkillsList.innerHTML = '';
  customSkillCount.textContent = String(customSkills.length);

  if (customSkills.length === 0) {
    const hint = document.createElement('div');
    hint.className = 'nav-empty-hint';
    hint.textContent = 'No custom skills yet. Click New Skill to build from plain English or code.';
    customSkillsList.appendChild(hint);
    return;
  }

  customSkills.forEach(skill => {
    const row = document.createElement('div');
    row.className = 'custom-nav-row';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-item' + (skill.id === activeSkillId ? ' active' : '');
    btn.dataset.skill = skill.id;

    const iconWrap = document.createElement('span');
    iconWrap.className = 'nav-item-svg';
    iconWrap.setAttribute('aria-hidden', 'true');
    iconWrap.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>';

    const textWrap = document.createElement('div');
    textWrap.className = 'nav-item-text';

    const titleEl = document.createElement('span');
    titleEl.className = 'nav-item-title';
    titleEl.textContent = skill.name;

    const subEl = document.createElement('span');
    subEl.className = 'nav-item-sub';
    subEl.textContent = skill.source ? (skill.filename || 'Compiled Code') : 'Custom Prompt';

    textWrap.append(titleEl, subEl);
    btn.append(iconWrap, textWrap);
    btn.addEventListener('click', () => loadSkill(skill.id));

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn-delete-custom';
    delBtn.title = `Remove ${skill.name}`;
    delBtn.setAttribute('aria-label', `Remove ${skill.name}`);
    delBtn.textContent = '×';
    delBtn.addEventListener('click', async e => {
      e.stopPropagation();
      customSkills = customSkills.filter(c => c.id !== skill.id);
      saveStoredCustomSkills();
      renderCustomSkillsSidebar();
      if (activeSkillId === skill.id) {
        await loadSkill(customSkills[0]?.id || 'stripe-billing');
      }
    });

    row.append(btn, delBtn);
    customSkillsList.appendChild(row);
  });
}

// Copy SKILL.md Quick Button
async function copyBareMarkdown(btnElement) {
  if (!currentCompilation) return;
  const name = currentCompilation.ir.name;
  const skillMdContent = currentCompilation.targetFiles[`skills/${name}/SKILL.md`] || '';
  if (!skillMdContent) {
    installResultLog.hidden = false;
    installResultLog.textContent = 'SKILL.md was not generated for this compilation.';
    return;
  }

  await navigator.clipboard.writeText(skillMdContent);
  const originalHtml = btnElement.innerHTML;
  btnElement.classList.add('copied');
  btnElement.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>
    <span>Copied SKILL.md!</span>
  `;
  setWorkflowStep('deploy');
  setTimeout(() => {
    btnElement.classList.remove('copied');
    btnElement.innerHTML = originalHtml;
  }, 1800);
}

copyBareMdQuickBtn.addEventListener('click', () => copyBareMarkdown(copyBareMdQuickBtn));

init();
