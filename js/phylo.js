/**
 * Parse a Newick tree string into a doubly-linked
 * list of JS Objects.  Assigns node labels, branch
 * lengths and node IDs (numbering terminal before
 * internal nodes).
 * @param {string} text Newick tree string.
 * @return {object} Root of tree.
 */
function readTree(text) {
    // remove whitespace
    text = text.replace(/ |\t|\r?\n|\r/g, '');

    var tokens = text.split(/(;|\(|\)|,)/),
        root = {'parent': null, 'children':[]},
        curnode = root,
        nodeId = 0,
        nodeinfo;

    var node_labels = [];

    for (const token of tokens) {
        if (token == "" || token == ';') {
            continue
        }
        //console.log(token);
        if (token == '(') {
            // add a child to current node
            var child = {
                'parent': curnode,
                'children': []
            };
            curnode.children.push(child);
            curnode = child;  // climb up
        }
        else if (token == ',') {
            // climb down, add another child to parent
            curnode = curnode.parent;
            var child = {
                'parent': curnode,
                'children': []
            }
            curnode.children.push(child);
            curnode = child;  // climb up
        }
        else if (token == ')') {
            // climb down twice
            curnode = curnode.parent;
            if (curnode === null) {
                break;
            }
        }
        else {
            nodeinfo = token.split(':');
            node_labels.push(nodeinfo);

            if (nodeinfo.length==1) {
                if (token.startsWith(':')) {
                    curnode.label = "";
                    curnode.branchLength = parseFloat(nodeinfo[0]);
                } else {
                    curnode.label = nodeinfo[0];
                    curnode.branchLength = null;
                }
            }
            else if (nodeinfo.length==2) {
                curnode.label = nodeinfo[0];
                curnode.branchLength = parseFloat(nodeinfo[1]);
            }
            else {
                // TODO: handle edge cases with >1 ":"
                console.warn(token, "I don't know what to do with two colons!");
            }
            curnode.id = nodeId++;  // assign then increment
        }
    }

    // if root node is unlabelled
    if (node_labels.length < nodeId) {
        curnode.id = nodeId;
    }

    return (drawtree(root));
}

//var s = "(A:0.1,B:0.2,(C:0.3,D:0.4)E:0.5)F;";
//readTree(s);

/**
 * Recursive function for traversal of tree
 * (output parent before children).
 * @param {object} node
 * @param {string} 'preorder' or 'postorder' traversal
 * @param {Array}  an Array of nodes
 * @return An Array of nodes in pre-order
 */
function traverse(node, order='preorder', list=Array()) {
    if (order=='preorder') list.push(node);
    for (var i=0; i < node.children.length; i++) {
        list = traverse(node.children[i], order, list);
    }
    if (order=='postorder') list.push(node);
    return(list);
}


/**
 * Rectangular layout of tree, update nodes in place with x,y coordinates
 * @param {object} root
 */
function rectLayout(root) {
    // assign vertical positions to tips by postorder traversal
    var counter = 0;
    for (const node of traverse(root, 'postorder')) {
        if (node.children.length == 0) {
            // assign position to tip
            node.y = counter;
            counter++;
        } else {
            // ancestral node position is average of child nodes
            node.y = 0;
            for (var i = 0; i < node.children.length; i++) {
                var child = node.children[i];
                node.y += child.y;
            }
            node.y /= node.children.length;
        }
    }

    // assign horizontal positions by preorder traversal
    for (const node of traverse(root, 'preorder')) {
        if (node.parent === null) {
            // assign root to x=0
            node.x = 0.;
        } else {
            node.x = node.parent.x + node.branchLength;
        }
    }
}



/**
 * Convert parsed Newick tree from readTree() into more convenient
 * tabular data frame.
 * @param {object} tree: Return value of readTree
 * @param {boolean} sort: if true, sort data frame by node name
 * @return Array of Objects
 */
function fortify(tree, sort=true) {
    var df = [];

    for (const node of traverse(tree, 'preorder')) {
        if (node.parent === null) {
            df.push({
                'parentId': null,
                'parentLabel': null,
                'thisId': node.id,
                'thisLabel': node.label,
                'children': node.children.map(x=>x.id),
                'branchLength': 0.,
                'isTip': (node.children.length==0),
                'x': node.x,
                'y': node.y,
                'angle': node.angle
            })
        }
        else {
            df.push({
                'parentId': node.parent.id,
                'parentLabel': node.parent.label,
                'thisId': node.id,
                'thisLabel': node.label,
                'children': node.children.map(x=>x.id),
                'branchLength': node.branchLength,
                'isTip': (node.children.length==0),
                'x': node.x,
                'y': node.y,
                'angle': node.angle
            })
        }
    }

    if (sort) {
        df = df.sort(function(a, b) {
            return a.thisId - b.thisId;
        })
    }
    return(df);
}


/**
 * Generate edge list with x,y coordinates extracted from the
 * respective nodes.
 * @param {Array} df:  tabular data frame from fortify()
 * @param {boolean} rectangular:  if true, draw two line segments connected
 *                                by right angle
 * @returns {Array}
 */
function edges(df, rectangular=false) {
    var result = [],
        parent, pair;

    // make sure data frame is sorted
    df.sort(function(a, b) {
        return a.thisId - b.thisId;
    })

    for (const row of df) {
        if (row.parentId === null) {
            continue  // skip the root
        }
        parent = df[row.parentId];
        if (parent === null || parent === undefined) {
            console.log('parent null/undefined');
            continue;
        }

        if (rectangular) {
          pair = {
              x1: row.x, y1: row.y, id1: row.thisId,
              x2: parent.x, y2: row.y, id2: undefined
          };
          result.push(pair);
          pair = {
              x1: parent.x, y1: row.y, id1: undefined,
              x2: parent.x, y2: parent.y, id2: row.parentId
          };
          result.push(pair);
        }
        else {
          var pair = {
              x1: row.x, y1: row.y, id1: row.thisId,
              x2: parent.x, y2: parent.y, id2: row.parentId
          };
          result.push(pair);
        }
    }
    return(result);
}


/**
 * Draw time-scaled tree in SVG
 * @param {Object} timetree:  time-scaled phylogenetic tree imported as JSON
 * @returns {Array}  data frame
 */
function drawtree(timetree) {
    var width = 900,
        height = 400,
        svg = d3.select("div#svg-timetree")
          .append("svg")
          .attr("width", width)
          .attr("height", height)
          .append("g");

    // set up plotting scales
    var xValue = function(d) { return d.x; },
      xScale = d3.scaleLinear().range([0, width]),
      xMap1 = function(d) { return xScale(d.x1); },  // lines
      xMap2 = function(d) { return xScale(d.x2); },
      xAxis = d3.axisBottom(xScale);

    var yValue = function(d) { return d.y; },
      yScale = d3.scaleLinear().range([height, 0]),  // inversion
      yMap1 = function(d) { return yScale(d.y1); },
      yMap2 = function(d) { return yScale(d.y2); },
      yAxis = d3.axisLeft(yScale);

    // generate tree layout (x, y coordinates
    rectLayout(timetree);

    var df = fortify(timetree),
        edgeset = edges(df, rectangular=true);

    // add buffer to data domain
    xScale.domain([
        d3.min(df, xValue)-0.05, d3.max(df, xValue)+0.05
    ]);
    yScale.domain([
        d3.min(df, yValue)-1, d3.max(df, yValue)+1
    ]);

    // draw x-axis
    svg.append("g")
      .attr("class", "x axis")
      .attr("transform", "translate(0," + height + ")")
      .call(xAxis);

    // draw lines
    svg.selectAll("lines")
      .data(edgeset)
      .enter().append("line")
      .attr("class", "lines")
      .attr("x1", xMap1)
      .attr("y1", yMap1)
      .attr("x2", xMap2)
      .attr("y2", yMap2)
      .attr("stroke-width", 2)
      .attr("stroke", "#777");

    return(df);
}


/**
 * Add subtree objects to time-scaled tree.
 * @param {Array} df
 * @param {Object} clusters
 */
function draw_clusters(df, clusters) {
    var svg = document.querySelector("#svg-timetree > svg");

    var xValue = function(d) { return d.x; },
        xScale = d3.scaleLinear().range([0, width]),
        xMap = function(d) { return xScale(xValue(d)); };  // points

    var yValue = function(d) { return d.y; },
        yScale = d3.scaleLinear().range([height, 0]),  // inversion
        yMap = function(d) { return yScale(yValue(d)); };

    for (const cluster in clusters) {
        var labels = Object.keys(cluster['nodes']),
            root = df.filter(x => x.thisLabel == labels[0])[0],
            origin = new Date(cluster[root]['coldate']),
            dt;

        // find most recent sample collection date
        var coldates = Array();
        for (const label in labels) {
            var variant = cluster['nodes'][label];
            coldates.push(variant.filter(x => x['coldate']));
        }
    }
}