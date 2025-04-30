const fileInput = document.getElementById("lorebookFile");
const svg = d3.select("#graphContainer");
const tooltip = d3.select("#tooltip");
const contextMenu = d3.select("#contextMenu");
const showOutgoingBtn = document.getElementById("showOutgoing");
const showIncomingBtn = document.getElementById("showIncoming");
const showAllBtn = document.getElementById("showAll");
const fullscreenBtn = document.getElementById("fullscreen-btn"); // Get the fullscreen button
const nodeDistanceSlider = document.getElementById("nodeDistanceSlider");
const nodeDistanceValue = document.getElementById("nodeDistanceValue");
const linkThicknessSlider = document.getElementById("linkThicknessSlider");
const linkThicknessValue = document.getElementById("linkThicknessValue");
const nodeSizeSlider = document.getElementById("nodeSizeSlider");
const nodeSizeValue = document.getElementById("nodeSizeValue");

let width, height;
let allNodes = []; // Store all nodes globally
let allLinks = []; // Store all links globally
let currentNodes = []; // Store currently displayed nodes
let currentLinks = []; // Store currently displayed links
let selectedNodeId = null; // Store the ID of the right-clicked node
let simulation; // Store the simulation globally to stop/restart
let linkElements, nodeElements; // Store selections for easy access

fileInput.addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const lorebookData = JSON.parse(e.target.result);
      // Basic validation (check if it has 'data' array)
      if (lorebookData && Array.isArray(lorebookData.data)) {
        processAndVisualize(lorebookData.data);
      } else {
        alert("Invalid Lorebook JSON format. Missing 'data' array.");
      }
    } catch (error) {
      alert(`Error parsing JSON: ${error}`);
      console.error("JSON Parsing Error:", error);
    }
  };
  reader.onerror = (e) => {
    alert(`Error reading file: ${e}`);
    console.error("File Reading Error:", e);
  };
  reader.readAsText(file);
});

function processAndVisualize(lorebookEntries) {
  // Clear previous graph if any
  svg.selectAll("*").remove();

  // Get SVG dimensions
  const svgRect = svg.node().getBoundingClientRect();
  width = svgRect.width;
  height = svgRect.height;

  console.log("Lorebook Entries:", lorebookEntries);

  // --- Step 3: Data Transformation (Nodes & Links) ---
  const graphData = buildGraphData(lorebookEntries);
  allNodes = graphData.nodes; // Store globally
  allLinks = graphData.links; // Store globally

  console.log("Full Graph Data:", { nodes: allNodes, links: allLinks });

  // --- Step 4: D3 Visualization ---
  renderGraph(allNodes, allLinks); // Initial render with all data
}

function buildGraphData(lorebookEntries) {
  // Map entries to nodes, adding a unique ID based on array index
  const nodes = lorebookEntries
    .filter((entry) => entry.content) // Filter out entries without content
    .map((entry, index) => ({
      id: index,
      ...entry, // Copy all original properties from the lorebook entry
    }));

  const links = []; // Array to store the links between nodes
  const linkSet = new Set(); // Set to track existing links and prevent duplicates

  // Iterate through each node to treat it as a potential source
  nodes.forEach((sourceNode, i) => {
    // Iterate through each node again to treat it as a potential target
    nodes.forEach((targetNode, j) => {
      // Skip if the source and target are the same node
      if (i === j) return;

      let activationKeys = [];

      // Extract keys from the target node's 'key' field
      // Split by comma, trim whitespace, and filter out empty strings
      if (targetNode.key) {
        activationKeys = activationKeys.concat(
          targetNode.key
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k)
        );
      }

      // Extract keys from the target node's 'secondkey' field
      // Split by comma, trim whitespace, and filter out empty strings
      if (targetNode.secondkey) {
        activationKeys = activationKeys.concat(
          targetNode.secondkey
            .split(",")
            .map((k) => k.trim())
            .filter((k) => k)
        );
      }

      // Remove duplicate keys from the combined list using a Set
      activationKeys = [...new Set(activationKeys)];

      // If the target node has no activation keys, skip to the next target
      if (activationKeys.length === 0) return;

      // Determine if the search should be case-sensitive based on target node's extension property
      const caseSensitive = targetNode.extentions?.risu_case_sensitive ?? false; // Default to false
      // Prepare the source content for searching (convert to lowercase if case-insensitive)
      const sourceContent = caseSensitive
        ? sourceNode.content
        : sourceNode.content.toLowerCase();

      let foundLink = false; // Flag to indicate if a link should be created

      // Iterate through the activation keys of the target node
      for (const key of activationKeys) {
        // Prepare the search key (convert to lowercase if case-insensitive)
        const searchKey = caseSensitive ? key : key.toLowerCase();

        // Skip empty search keys (should already be filtered, but as a safeguard)
        if (searchKey === "") continue;

        // Check if the source content includes the search key
        // NOTE: Regex logic based on targetNode.useRegex is not implemented here yet.
        if (sourceContent.includes(searchKey)) {
          foundLink = true; // A match is found
          break; // Stop checking keys for this source-target pair once a match is found
        }
      }

      // If a link was found between the source and target
      if (foundLink) {
        // Create a unique identifier for the directed link (source -> target)
        const linkIdentifier = `${i}->${j}`;
        // Check if this specific link already exists to avoid duplicates
        if (!linkSet.has(linkIdentifier)) {
          // Add the new link to the links array
          links.push({ source: i, target: j });
          // Add the identifier to the set to mark this link as created
          linkSet.add(linkIdentifier);
        }
      }
    });
  });

  // Return the processed nodes and links
  return { nodes, links };
  // Hide context menu on click outside
  d3.select("body").on("click", () => {
    contextMenu.style("display", "none");
    selectedNodeId = null;
  });
}

// --- Graph Traversal Functions ---

function findReachableNodes(startNodeId, nodes, links) {
  const reachable = new Set();
  const queue = [startNodeId];
  reachable.add(startNodeId);

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    links.forEach((link) => {
      // Ensure link source/target are objects with id, not just ids
      const sourceId =
        typeof link.source === "object" ? link.source.id : link.source;
      const targetId =
        typeof link.target === "object" ? link.target.id : link.target;

      if (sourceId === currentNodeId && !reachable.has(targetId)) {
        reachable.add(targetId);
        queue.push(targetId);
      }
    });
  }
  return reachable;
}

function findReachingNodes(endNodeId, nodes, links) {
  const reaching = new Set();
  const queue = [endNodeId];
  reaching.add(endNodeId);

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    links.forEach((link) => {
      // Ensure link source/target are objects with id, not just ids
      const sourceId =
        typeof link.source === "object" ? link.source.id : link.source;
      const targetId =
        typeof link.target === "object" ? link.target.id : link.target;

      if (targetId === currentNodeId && !reaching.has(sourceId)) {
        reaching.add(sourceId);
        queue.push(sourceId);
      }
    });
  }
  return reaching;
}

// --- Rendering Function ---

function renderGraph(nodes, links) {
  currentNodes = nodes; // Update currently displayed data
  currentLinks = links;

  // Clear previous graph elements
  svg.selectAll("*").remove();

  // Stop previous simulation if it exists
  if (simulation) {
    simulation.stop();
  }

  // Recreate simulation with potentially filtered data
  simulation = d3
    .forceSimulation(nodes)
    .velocityDecay(0.6) // Increased damping
    .force(
      "link",
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(+nodeDistanceSlider.value) // Use initial slider value
    )
    .force("charge", d3.forceManyBody().strength(-150)) // Keep charge for now
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(0.05)) // Added X force
    .force("y", d3.forceY(height / 2).strength(0.05)) // Added Y force
    .on("tick", ticked);

  // --- Create Links ---
  const linkG = svg
    .append("g") // Group for links
    .attr("class", "links");

  // --- Define Arrowhead Markers for different states ---
  const defs = svg.append("defs");

  // Default arrow
  defs
    .append("marker")
    .attr("id", "arrowhead")
    .attr("viewBox", "-0 -5 10 10")
    .attr("refX", 16)
    .attr("refY", 0)
    .attr("orient", "auto")
    .attr("markerWidth", 3)
    .attr("markerHeight", 3)
    .attr("xoverflow", "visible")
    .append("path")
    .attr("d", "M 0,-5 L 10 ,0 L 0,5")
    .attr("fill", "#5f5b63")
    .style("stroke", "none");

  // Red arrow for incoming
  defs
    .append("marker")
    .attr("id", "arrowhead-red")
    .attr("viewBox", "-0 -5 10 10")
    .attr("refX", 16)
    .attr("refY", 0)
    .attr("orient", "auto")
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("xoverflow", "visible")
    .append("path")
    .attr("d", "M 0,-5 L 10 ,0 L 0,5")
    .attr("fill", "#ff0000")
    .style("stroke", "none");

  // Orange arrow for outgoing
  defs
    .append("marker")
    .attr("id", "arrowhead-orange")
    .attr("viewBox", "-0 -5 10 10")
    .attr("refX", 16)
    .attr("refY", 0)
    .attr("orient", "auto")
    .attr("markerWidth", 6)
    .attr("markerHeight", 6)
    .attr("xoverflow", "visible")
    .append("path")
    .attr("d", "M 0,-5 L 10 ,0 L 0,5")
    .attr("fill", "#ff8800")
    .style("stroke", "none");

  const link = linkG
    .selectAll("line")
    .data(links)
    .enter()
    .append("line")
    .attr("class", "link")
    .attr("marker-end", "url(#arrowhead)")
    .style("stroke-width", linkThicknessSlider.value + "px"); // Use initial slider value

  // Store link selection
  linkElements = link;

  // --- Create Nodes ---
  const nodeG = svg
    .append("g") // Group for nodes
    .attr("class", "nodes");

  // --- Create Nodes (Group with Circle + Text) ---
  // Removed incorrect block that was redeclaring 'node' and mixing link/node logic
  const node = nodeG
    .selectAll("g") // This is the correct node creation block
    .data(nodes)
    .enter()
    .append("g")
    .attr("class", "node")

    .call(
      d3
        .drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended)
    )
    .on("mouseover", handleMouseOver)
    .on("mouseout", handleMouseOut)
    .on("contextmenu", handleContextMenu); // Add context menu handler

  // Store node selection
  nodeElements = node;

  nodeElements
    .append("circle")
    .attr("r", +nodeSizeSlider.value) // Use initial slider value
    .attr("fill", (d) => (d.alwaysActive ? "red" : "blue"));

  node
    .append("text")
    .text((d) => d.comment)
    .attr("x", 12)
    .attr("y", 3);

  // --- Ticked Function ---
  function ticked() {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    // Adjust node position slightly for arrowhead visibility if needed
    // This basic translation works, but more complex calculations might be needed
    // for perfect alignment if nodes have varying sizes or shapes.
    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  }

  // --- Drag Functions ---
  function dragstarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
  }

  function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
  }

  function dragended(event, d) {
    if (!event.active) simulation.alphaTarget(0);
    d.fx = null;
    d.fy = null;
  }

  // --- Event Handlers ---
  function handleMouseOver(event, d) {
    const hoveredNodeId = d.id;
    const hoveredNodeElement = d3.select(this);

    // Select all nodes and links
    const allNodes = svg.selectAll(".node");
    const allLinks = svg.selectAll(".link");

    // --- Node Highlighting using CSS Classes ---
    // 1. Reset all node classes and apply dimmed class
    allNodes
      .classed("node-highlight-hovered", false)
      .classed("node-highlight-source", false)
      .classed("node-highlight-target", false)
      .classed("node-dimmed", true); // Dim all nodes initially

    // Find connected links (needed for both link and node highlighting)
    const connectedLinks = allLinks.filter((l) => {
      const sourceId = typeof l.source === "object" ? l.source.id : l.source;
      const targetId = typeof l.target === "object" ? l.target.id : l.target;
      return sourceId === hoveredNodeId || targetId === hoveredNodeId;
    });

    // --- Link Highlighting using CSS Classes ---
    // Reset link highlights first
    allLinks.classed("link-highlight-incoming", false);
    allLinks.classed("link-highlight-outgoing", false);
    // Opacity is handled by the classes or default CSS

    // 2. Highlight connected nodes and apply link classes
    const connectedNodeIds = new Set([hoveredNodeId]); // Keep track of nodes to highlight

    connectedLinks
      .style("opacity", 1) // Make connected links fully visible (overrides default 0.6)
      .each(function (l) {
        const linkElement = d3.select(this);
        const sourceNodeData = l.source; // Get the full node data object
        const targetNodeData = l.target; // Get the full node data object
        const sourceId =
          typeof sourceNodeData === "object"
            ? sourceNodeData.id
            : sourceNodeData;
        const targetId =
          typeof targetNodeData === "object"
            ? targetNodeData.id
            : targetNodeData;

        // Add connected node IDs to the set
        connectedNodeIds.add(sourceId);
        connectedNodeIds.add(targetId);
        // Apply link classes
        if (targetId === hoveredNodeId) {
          // Incoming link
          linkElement.classed("link-highlight-incoming", true);
          linkElement.classed("link-highlight-outgoing", false);
          // Highlight the source node of the incoming link
          allNodes
            .filter((n) => n.id === sourceId)
            .classed("node-highlight-source", true)
            .classed("node-dimmed", false); // Undim
        } else if (sourceId === hoveredNodeId) {
          // Outgoing link
          linkElement.classed("link-highlight-outgoing", true);
          linkElement.classed("link-highlight-incoming", false);
          // Highlight the target node of the outgoing link
          allNodes
            .filter((n) => n.id === targetId)
            .classed("node-highlight-target", true)
            .classed("node-dimmed", false); // Undim
        } else {
          // Link connects two neighbors, reset its specific classes if any were applied
          linkElement.classed("link-highlight-incoming", false);
          linkElement.classed("link-highlight-outgoing", false);
        }
      });

    // 3. Highlight the hovered node itself
    hoveredNodeElement
      .classed("node-highlight-hovered", true)
      .classed("node-dimmed", false); // Undim hovered node

    // --- End Node and Link Highlighting ---
  }

  function handleMouseOut(event, d) {
    // Pass d to access original radius if needed, though we reset to fixed value
    // Reset all node classes and styles
    svg
      .selectAll(".node")
      .classed("node-highlight-hovered", false)
      .classed("node-highlight-source", false)
      .classed("node-highlight-target", false)
      .classed("node-dimmed", false) // Remove dimmed class
      .style("opacity", null); // Reset opacity

    // Reset node circle styles (if not fully handled by CSS reset)
    // svg.selectAll('.node circle')
    //     .attr('r', 8)
    //     .attr('stroke', 'none'); // Let CSS handle fill

    // Reset link classes and styles
    svg
      .selectAll(".link")
      .classed("link-highlight-incoming", false)
      .classed("link-highlight-outgoing", false)
      .style("opacity", null); // Reset opacity to let CSS handle it
    // No need to reset stroke, stroke-width, marker-end as CSS classes are removed

    // Hide tooltip (existing functionality)
    tooltip.style("display", "none");
  }

  function handleContextMenu(event, d) {
    event.preventDefault(); // Prevent default browser menu
    selectedNodeId = d.id; // Store the clicked node's ID
    contextMenu
      .style("display", "block")
      .style("left", event.pageX + "px")
      .style("top", event.pageY + "px");
  }

  // --- Zoom Functionality ---
  const zoom = d3
    .zoom()
    .scaleExtent([0.1, 8])
    .on("zoom", (event) => {
      // Apply transform to the main groups
      linkG.attr("transform", event.transform);
      nodeG.attr("transform", event.transform);
    });

  svg.call(zoom); // Apply zoom behavior
}

// --- Context Menu Button Listeners ---
showOutgoingBtn.addEventListener("click", () => {
  if (selectedNodeId === null) return;
  contextMenu.style("display", "none"); // Hide menu

  const reachableIds = findReachableNodes(selectedNodeId, allNodes, allLinks);
  const filteredNodes = allNodes.filter((n) => reachableIds.has(n.id));
  const filteredLinks = allLinks.filter((l) => {
    const sourceId = typeof l.source === "object" ? l.source.id : l.source;
    const targetId = typeof l.target === "object" ? l.target.id : l.target;
    return reachableIds.has(sourceId) && reachableIds.has(targetId);
  });

  console.log("Showing Outgoing:", {
    nodes: filteredNodes,
    links: filteredLinks,
  });
  renderGraph(filteredNodes, filteredLinks);
  selectedNodeId = null; // Reset selected node
});

showIncomingBtn.addEventListener("click", () => {
  if (selectedNodeId === null) return;
  contextMenu.style("display", "none"); // Hide menu

  const reachingIds = findReachingNodes(selectedNodeId, allNodes, allLinks);
  const filteredNodes = allNodes.filter((n) => reachingIds.has(n.id));
  const filteredLinks = allLinks.filter((l) => {
    const sourceId = typeof l.source === "object" ? l.source.id : l.source;
    const targetId = typeof l.target === "object" ? l.target.id : l.target;
    return reachingIds.has(sourceId) && reachingIds.has(targetId);
  });

  console.log("Showing Incoming:", {
    nodes: filteredNodes,
    links: filteredLinks,
  });
  renderGraph(filteredNodes, filteredLinks);
  selectedNodeId = null; // Reset selected node
});

showAllBtn.addEventListener("click", () => {
  contextMenu.style("display", "none"); // Hide menu
  console.log("Showing All");
  renderGraph(allNodes, allLinks); // Render the full graph
  selectedNodeId = null; // Reset selected node
});

// --- Fullscreen Button Listener ---
fullscreenBtn.addEventListener("click", () => {
    const elem = document.documentElement; // Target the whole page for simplicity

    if (!document.fullscreenElement) {
        // Enter fullscreen
        if (elem.requestFullscreen) {
            elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) { /* Safari */
            elem.webkitRequestFullscreen();
        } else if (elem.msRequestFullscreen) { /* IE11 */
            elem.msRequestFullscreen();
        }
        // Optionally adjust SVG size or simulation on fullscreen entry
        // resizeGraph(); // Example function call
    } else {
        // Exit fullscreen
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { /* Safari */
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { /* IE11 */
            document.msExitFullscreen();
        }
         // Optionally adjust SVG size or simulation on fullscreen exit
        // resizeGraph(); // Example function call
    }
});

// Optional: Listen for fullscreen change events to resize graph
document.addEventListener('fullscreenchange', resizeGraph);
document.addEventListener('webkitfullscreenchange', resizeGraph); // Safari
document.addEventListener('msfullscreenchange', resizeGraph); // IE11

function resizeGraph() {
    // Recalculate width/height based on the new viewport/element size
    const svgRect = svg.node().getBoundingClientRect();
    width = svgRect.width;
    height = svgRect.height;

    // Update simulation center and forces if needed
    if (simulation) {
        simulation.force("center", d3.forceCenter(width / 2, height / 2));
        simulation.force("x", d3.forceX(width / 2).strength(0.05));
        simulation.force("y", d3.forceY(height / 2).strength(0.05));
        simulation.alpha(0.1).restart(); // Give simulation a kick
    }

    // You might need to adjust zoom/pan state here as well if using d3.zoom
    // For example, reset zoom or adjust the transform
    // svg.call(zoom.transform, d3.zoomIdentity); // Reset zoom example
}

// --- Slider Event Listeners ---

nodeDistanceSlider.addEventListener("input", (event) => {
    const newDistance = +event.target.value;
    nodeDistanceValue.textContent = newDistance;
    if (simulation) {
        simulation.force("link").distance(newDistance);
        simulation.alpha(0.1).restart(); // Give simulation a kick to adjust distances
    }
});

linkThicknessSlider.addEventListener("input", (event) => {
    const newThickness = event.target.value;
    linkThicknessValue.textContent = newThickness;
    if (linkElements) {
        linkElements.style("stroke-width", newThickness + "px");
    }
});

nodeSizeSlider.addEventListener("input", (event) => {
    const newSize = +event.target.value;
    nodeSizeValue.textContent = newSize;
    if (nodeElements) {
        nodeElements.selectAll("circle").attr("r", newSize);
        // Adjust text position slightly based on new radius
        nodeElements.selectAll("text").attr("x", newSize + 4);
    }
});
