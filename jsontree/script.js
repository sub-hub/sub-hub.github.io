const MAX_NAME_LENGTH = 10;
document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');
    const uploadButton = document.getElementById('upload-button');
    const pasteClipboardButton = document.getElementById('paste-clipboard-button');
    const uploadBox = document.getElementById('upload-box');
    const loadingOverlay = document.getElementById('loading-overlay');
    pasteClipboardButton.addEventListener('click', async () => {
        try {
            loadingOverlay.classList.remove('hidden');
            const text = await navigator.clipboard.readText();
            if (!text) {
                alert('클립보드에 텍스트가 없습니다.');
                loadingOverlay.classList.add('hidden');
                return;
            }
            let json_data;
            try {
                json_data = JSON.parse(text);
            } catch (error) {
                alert('클립보드의 내용이 올바른 JSON 형식이 아닙니다.');
                loadingOverlay.classList.add('hidden');
                return;
            }
            const analysisResult = analyzeJsonSize(json_data, '클립보드 JSON');
            const fakeFile = { name: '클립보드 JSON', size: text.length };
            displayResults(analysisResult, fakeFile);
        } catch (err) {
            alert('클립보드 접근에 실패했습니다. 브라우저 권한을 확인하세요.');
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    });
    
    const viewToggleButtons = document.getElementById('view-toggle-buttons');
    const toggleButtons = document.querySelectorAll('.toggle-btn');
    const treePanel = document.getElementById('tree-panel');
    const treemapPanel = document.getElementById('treemap-panel');
    
    const treeContainer = document.getElementById('tree-container');
    const treemapContainer = document.getElementById('treemap-container');
    const fileInfo = document.getElementById('file-info');

    const treemapChart = echarts.init(treemapContainer);

    uploadButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    toggleButtons.forEach(button => {
        button.addEventListener('click', () => {
            const view = button.dataset.view;

            toggleButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            treePanel.classList.add('hidden');
            treemapPanel.classList.add('hidden');

            if (view === 'tree-panel') {
                treePanel.classList.remove('hidden');
            } else if (view === 'treemap-panel') {
                treemapPanel.classList.remove('hidden');
                treemapChart.resize();
            }
        });
    });

    function handleFiles(files) {
        if (files.length === 0) return;
        const file = files[0];

        if (!file.type.includes('json')) {
            alert('JSON 파일만 업로드할 수 있습니다.');
            return;
        }

        loadingOverlay.classList.remove('hidden');

        setTimeout(() => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const json_data = JSON.parse(e.target.result);
                    const analysisResult = analyzeJsonSize(json_data, file.name);
                    displayResults(analysisResult, file);
                } catch (error) {
                    alert(`JSON 파싱 오류: ${error.message}`);
                } finally {
                    loadingOverlay.classList.add('hidden');
                }
            };
            reader.readAsText(file);
        }, 100);
    }

    const textEncoder = new TextEncoder();
    const getByteSize = (data) => textEncoder.encode(JSON.stringify(data)).length;

    function analyzeJsonSize(data, name = 'root') {
        const nodeType = Object.prototype.toString.call(data).slice(8, -1);
        const node = { name, size: getByteSize(data), children: [] };

        if (nodeType === 'Object') {
            node.type = 'Object';
            node.children = Object.entries(data).map(([key, value]) => analyzeJsonSize(value, key)).sort((a, b) => b.size - a.size);
        } else if (nodeType === 'Array') {
            node.type = 'Array';
            node.children = data.map((item, index) => {
                let childName = `[${index}]`;

                if (typeof item === 'object' && item !== null) {
                    if("role" in item && "data" in item) {
                        const value = item.data;
                        childName += ` - ${value.substring(value.length / 2, MAX_NAME_LENGTH)}`;
                        return analyzeJsonSize(item, childName);
                    }
                    const preferredKeys = ['name', 'comment', 'key', 'id', 'title']; 

                    for (const keyName of preferredKeys) {
                        const value = item[keyName];
                        if (typeof value === 'string') {
                            childName += ` - ${value.substring(0, MAX_NAME_LENGTH)}`;
                            break;
                        }
                    }
                }
                return analyzeJsonSize(item, childName);
            }).sort((a, b) => b.size - a.size);
        } else {
            node.type = `Value (${nodeType})`;
            node.value = data
        }
        return node;
    }

    function displayResults(result, file) {
        uploadBox.classList.add('hidden');
        viewToggleButtons.classList.remove('hidden');

        fileInfo.textContent = `${file.name} (${formatBytes(file.size)})`;

        treeContainer.innerHTML = '';
        const rootNodeElement = createNodeElement(result, result.size);
        treeContainer.appendChild(rootNodeElement);

        const rootRow = rootNodeElement.querySelector('.tree-row');
        if (rootRow) {
            rootRow.click();
        }

        renderTreemap(result);
        
        document.getElementById('toggle-tree-view').click();
    }

    function createNodeElement(node, parentSize) {
        const nodeElement = document.createElement('div');
        nodeElement.className = 'tree-node';
        const row = document.createElement('div');
        row.className = 'tree-row';

        const hasChildren = node.children && node.children.length > 0;
        const percentage = parentSize > 0 ? (node.size / parentSize) * 100 : 0;

        const toggle = document.createElement('span');
        toggle.className = 'toggle';
        toggle.textContent = hasChildren ? '＋' : ' ';
        row.appendChild(toggle);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'node-name';
        nameSpan.textContent = node.name;
        if (node.hasOwnProperty('value')) {
            const valueSpan = document.createElement('span');
            valueSpan.className = 'value';
            let valueStr = String(node.value);
            if (valueStr.length > 50) valueStr = valueStr.substring(0, 47) + '...';
            valueSpan.textContent = `: ${valueStr}`;
            nameSpan.appendChild(valueSpan);
        }
        row.appendChild(nameSpan);

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'node-size';
        sizeSpan.textContent = formatBytes(node.size);
        row.appendChild(sizeSpan);

        const progressContainer = document.createElement('div');
        progressContainer.className = 'progress-bar-container';
        const progressBar = document.createElement('div');
        progressBar.className = 'progress-bar';
        progressBar.style.width = `${percentage}%`;
        progressContainer.appendChild(progressBar);
        row.appendChild(progressContainer);

        const percentageSpan = document.createElement('span');
        percentageSpan.className = 'node-percentage';
        percentageSpan.textContent = percentage.toFixed(1) + '%';
        row.appendChild(percentageSpan);

        const typeSpan = document.createElement('span');
        typeSpan.className = 'node-type';
        typeSpan.textContent = node.type;
        row.appendChild(typeSpan);

        nodeElement.appendChild(row);

        if (hasChildren) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children-container';
            childrenContainer.style.display = 'none';
            nodeElement.appendChild(childrenContainer);

            let childrenRendered = false;

            row.addEventListener('click', () => {
                const isHidden = childrenContainer.style.display === 'none';

                if (isHidden && !childrenRendered) {
                    node.children.forEach(child => {
                        childrenContainer.appendChild(createNodeElement(child, node.size));
                    });
                    childrenRendered = true;
                }

                childrenContainer.style.display = isHidden ? 'block' : 'none';
                toggle.textContent = isHidden ? '−' : '＋';
            });
        }
        return nodeElement;
    }

    function renderTreemap(data) {
        function formatForECharts(node) {
            const item = {
                name: node.name,
                value: node.size,
                type: node.type,
                percentageOfParent: node.percentageOfParent
            };
            if (node.children && node.children.length > 0) {
                const parentSize = node.size;
                item.children = node.children.map(child => {
                    child.percentageOfParent = parentSize > 0 ? (child.size / parentSize) * 100 : 0;
                    return formatForECharts(child);
                });
            }
            return item;
        }
        const echartData = formatForECharts(data);
        const option = {
            tooltip: {
                formatter: (info) => {
                    const { name, value, data } = info;
                    let breadcrumb = info.treePathInfo.map(item => item.name).join(' > ');
                    let percentageText = data.percentageOfParent !== undefined ? `(${data.percentageOfParent.toFixed(2)}% of parent)` : '';
                    return `<div style="font-size: 14px; color: #fff;"><strong>${breadcrumb}</strong><br>Size: ${formatBytes(value)} ${percentageText}<br>Type: ${data.type}</div>`;
                },
                backgroundColor: 'rgba(22, 33, 62, 0.9)',
                borderColor: '#0f3460',
                textStyle: { color: '#e0e0e0' }
            },
            series: [{
                type: 'treemap',
                data: [echartData],
                leafDepth: 1,
                levels: [
                    { itemStyle: { borderColor: '#1a1a2e', borderWidth: 3, gapWidth: 3 } },
                    { itemStyle: { borderColor: '#16213e', borderWidth: 1, gapWidth: 1 } },
                    { itemStyle: { borderColor: '#16213e', borderWidth: 1, gapWidth: 1 } },
                    { itemStyle: { borderColor: '#16213e', borderWidth: 1, gapWidth: 1 } },
                    { itemStyle: { borderColor: '#16213e', borderWidth: 1, gapWidth: 1 } },
                    { itemStyle: { borderColor: '#16213e', borderWidth: 1, gapWidth: 1 } },
                    { itemStyle: { borderColor: '#16213e', borderWidth: 1, gapWidth: 1 } },
                    { itemStyle: { borderColor: '#16213e', borderWidth: 1, gapWidth: 1 } },
                ],
                breadcrumb: {
                    show: true, height: 22, left: 'center', top: 10,
                    itemStyle: { textStyle: { color: '#e0e0e0' }, borderColor: 'rgba(255,255,255,0.3)' }
                },
                label: { show: true, formatter: '{b}', color: '#fff', fontSize: 12 },
                upperLabel: { show: true, height: 30, color: '#fff' }
            }]
        };
        treemapChart.setOption(option);
    }

    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    window.handleReceivedData = (dbString) => {
        loadingOverlay.classList.remove('hidden');
        try {
            const json_data = JSON.parse(dbString);
            const analysisResult = analyzeJsonSize(json_data, 'Risu DB');
            const fakeFile = { name: 'Risu DB', size: dbString.length };
            displayResults(analysisResult, fakeFile);
        } catch (error) {
            alert(`JSON 파싱 오류: ${error.message}`);
        } finally {
            loadingOverlay.classList.add('hidden');
        }
    };
});
