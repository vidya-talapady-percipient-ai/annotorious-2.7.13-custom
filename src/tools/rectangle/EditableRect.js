import EditableShape from "../EditableShape";
import { SVG_NAMESPACE } from "../../util/SVG";
import { format, setFormatterElSize } from "../../util/Formatting";
import {
  drawRect,
  drawRectMask,
  parseRectFragment,
  getRectSize,
  setRectSize,
  toRectFragment,
  setRectMaskSize,
} from "../../selectors/RectFragment";

const CORNER = "corner";
const EDGE = "edge";

/**
 * An editable rectangle shape.
 */
export default class EditableRect extends EditableShape {
  constructor(annotation, g, config, env) {
    super(annotation, g, config, env);

    this.svg.addEventListener("mousemove", this.onMouseMove);
    this.svg.addEventListener("mouseup", this.onMouseUp);

    const { x, y, w, h } = parseRectFragment(annotation, env.image);

    // SVG markup for this class looks like this:
    //
    // <g>
    //   <path class="a9s-selection mask"... />
    //   <g> <-- return this node as .element
    //     <rect class="a9s-outer" ... />
    //     <rect class="a9s-inner" ... />
    //     <rect class="a9s-edge" ... /> (x4)
    //     <g class="a9s-handle" ...> ... </g> (x4)
    //   </g>
    // </g>

    // 'g' for the editable rect compound shape
    this.containerGroup = document.createElementNS(SVG_NAMESPACE, "g");

    this.mask = drawRectMask(env.image, x, y, w, h);
    this.mask.setAttribute("class", "a9s-selection-mask");
    this.containerGroup.appendChild(this.mask);

    // The 'element' = rectangles + handles + edges
    this.elementGroup = document.createElementNS(SVG_NAMESPACE, "g");
    this.elementGroup.setAttribute("class", "a9s-annotation editable selected");
    this.elementGroup.setAttribute("data-id", annotation.id);

    this.rectangle = drawRect(x, y, w, h);
    this.rectangle
      .querySelector(".a9s-inner")
      .addEventListener("mousedown", this.onGrab(this.rectangle));

    this.elementGroup.appendChild(this.rectangle);

    // Add edge rectangles for resizing
    this.edges = this.createEdges(x, y, w, h);

    this.edges.forEach((edge) => {
      this.elementGroup.appendChild(edge);
      edge.addEventListener("mousedown", this.onGrab(edge, EDGE));
    });

    // Create corner handles
    this.handles = [
      [x, y, CORNER],
      [x + w, y, CORNER],
      [x + w, y + h, CORNER],
      [x, y + h, CORNER],
    ].map((t, i) => {
      const [x, y, type] = t;
      const handle = this.drawHandle(x, y);
      const handleInner = handle.querySelector(".a9s-handle-inner");

      // The circles are rendered in clockwise direction
      // So 0 and 2 show nwse-resize and 1 and 3 show nesw-resize as cursor
      if (i % 2 === 0) {
        handleInner.style.cursor = "nwse-resize";
      } else {
        handleInner.style.cursor = "nesw-resize";
      }

      handle.addEventListener("mousedown", this.onGrab(handle, type));
      this.elementGroup.appendChild(handle);

      return handle;
    });

    this.containerGroup.appendChild(this.elementGroup);

    g.appendChild(this.containerGroup);

    format(this.rectangle, annotation, config.formatters);

    // The grabbed element (handle, edge or entire group), if any
    this.grabbedElem = null;

    // Type of the grabbed element, either 'corner' or 'edge'
    this.grabbedType = null;

    // Mouse xy offset inside the shape, if mouse pressed
    this.mouseOffset = null;

    this.svgRoot = this.svg.closest("svg");
  }

  calculateEdgePadding = () => {
    const basePadding = 5; // Default edge transparent padding
    const zoomFactor = this.getZoomFactor();

    // Adjust padding based on zoom level
    const edgeResizePadding = basePadding / zoomFactor;

    return edgeResizePadding;
  };

  getZoomFactor = () => {
    const transform = this.svgRoot?.getScreenCTM();
    return transform ? transform.a : 1; // 'a' is the scaleX factor
  };

  createEdges(x, y, w, h) {
    const edgeResizePadding = this.calculateEdgePadding();

    return [
      this.createEdge(
        x,
        y - edgeResizePadding,
        w,
        2 * edgeResizePadding,
        "ns-resize",
        "top"
      ),
      this.createEdge(
        x + w - edgeResizePadding,
        y,
        2 * edgeResizePadding,
        h,
        "ew-resize",
        "right"
      ),
      this.createEdge(
        x,
        y + h - edgeResizePadding,
        w,
        2 * edgeResizePadding,
        "ns-resize",
        "bottom"
      ),
      this.createEdge(
        x - edgeResizePadding,
        y,
        2 * edgeResizePadding,
        h,
        "ew-resize",
        "left"
      ),
    ];
  }

  createEdge(x, y, width, height, cursor, position) {
    const edge = document.createElementNS(SVG_NAMESPACE, "rect");
    edge.setAttribute("x", x);
    edge.setAttribute("y", y);
    edge.setAttribute("width", width);
    edge.setAttribute("height", height);
    edge.setAttribute("class", `a9s-edge ${position}`);
    edge.style.fill = "transparent";
    edge.style.cursor = cursor;
    return edge;
  }

  onScaleChanged = () => {
    this.handles.map(this.scaleHandle);
    this.updateEdgePositions();
  };

  updateEdgePositions() {
    const edgeResizePadding = this.calculateEdgePadding();
    const { x, y, w, h } = getRectSize(this.rectangle);
    const [top, right, bottom, left] = this.edges;

    top.setAttribute("x", x);
    top.setAttribute("y", y - edgeResizePadding);
    top.setAttribute("width", w);
    top.setAttribute("height", 2 * edgeResizePadding);

    right.setAttribute("x", x + w - edgeResizePadding);
    right.setAttribute("y", y);
    right.setAttribute("width", 2 * edgeResizePadding);
    right.setAttribute("height", h);

    bottom.setAttribute("x", x);
    bottom.setAttribute("y", y + h - edgeResizePadding);
    bottom.setAttribute("width", w);
    bottom.setAttribute("height", 2 * edgeResizePadding);

    left.setAttribute("x", x - edgeResizePadding);
    left.setAttribute("y", y);
    left.setAttribute("width", 2 * edgeResizePadding);
    left.setAttribute("height", h);
  }

  setSize = (x, y, w, h) => {
    setRectSize(this.rectangle, x, y, w, h);
    setRectMaskSize(this.mask, this.env.image, x, y, w, h);
    setFormatterElSize(this.elementGroup, x, y, w, h);

    const [topleft, topright, bottomright, bottomleft] = this.handles;

    this.setHandleXY(topleft, x, y);
    this.setHandleXY(topright, x + w, y);
    this.setHandleXY(bottomright, x + w, y + h);
    this.setHandleXY(bottomleft, x, y + h);

    this.updateEdgePositions();
  };

  stretchCorners = (draggedHandleIdx, anchorHandle, mousePos) => {
    const anchor = this.getHandleXY(anchorHandle);

    const width = mousePos.x - anchor.x;
    const height = mousePos.y - anchor.y;

    const x = width > 0 ? anchor.x : mousePos.x;
    const y = height > 0 ? anchor.y : mousePos.y;
    const w = Math.max(1, Math.abs(width));
    const h = Math.max(1, Math.abs(height));

    this.setSize(x, y, w, h);

    return { x, y, w, h };
  };

  stretchEdge = (edge, mousePos) => {
    const currentRectDims = getRectSize(this.rectangle);
    const edgePosition = edge.getAttribute("class").split(" ")[1];

    let { x, y, w, h } = currentRectDims;
    switch (edgePosition) {
      case "top":
        h = y + h - mousePos.y;
        if (h < 1) {
          h = 1;
        }
        y = mousePos.y;
        break;
      case "right":
        w = mousePos.x - x;
        if (w < 1) {
          w = 1;
        }
        break;
      case "bottom":
        h = mousePos.y - y;
        if (h < 1) {
          h = 1;
        }
        break;
      case "left":
        w = x + w - mousePos.x;
        if (w < 1) {
          w = 1;
        }
        x = mousePos.x;
        break;
    }

    this.setSize(x, y, w, h);

    return { x, y, w, h };
  };

  onGrab = (grabbedElem, type) => (evt) => {
    if (evt.button !== 0) return; // left click

    evt.stopPropagation();

    this.grabbedElem = grabbedElem;
    this.grabbedType = type;
    const pos = this.getSVGPoint(evt);
    const { x, y } = getRectSize(this.rectangle);
    this.mouseOffset = { x: pos.x - x, y: pos.y - y };
  };

  onMouseMove = (evt) => {
    if (evt.button !== 0) return; // left click
    const constrain = (coord, max) =>
      coord < 0 ? 0 : coord > max ? max : coord;
    if (this.grabbedElem) {
      const pos = this.getSVGPoint(evt);
      if (this.grabbedElem === this.rectangle) {
        // x/y changes by mouse offset, w/h remains unchanged
        const { w, h } = getRectSize(this.rectangle);

        const { naturalWidth, naturalHeight } = this.env.image;

        const x = constrain(pos.x - this.mouseOffset.x, naturalWidth - w);
        const y = constrain(pos.y - this.mouseOffset.y, naturalHeight - h);

        this.setSize(x, y, w, h);
        this.emit(
          "update",
          toRectFragment(x, y, w, h, this.env.image, this.config.fragmentUnit)
        );
      } else if (this.grabbedType === CORNER) {
        // Mouse position replaces one of the corner coords, depending
        // on which handle is the grabbed element
        const handleIdx = this.handles.indexOf(this.grabbedElem);
        const oppositeHandle = this.handles[handleIdx ^ 2];

        const { x, y, w, h } = this.stretchCorners(
          handleIdx,
          oppositeHandle,
          pos
        );

        this.emit(
          "update",
          toRectFragment(x, y, w, h, this.env.image, this.config.fragmentUnit)
        );
      } else if (this.grabbedType === EDGE) {
        const { x, y, w, h } = this.stretchEdge(this.grabbedElem, pos);

        this.emit(
          "update",
          toRectFragment(x, y, w, h, this.env.image, this.config.fragmentUnit)
        );
      }
    }
  };

  onMouseUp = (evt) => {
    this.grabbedElem = null;
    this.grabbedType = null;
    this.mouseOffset = null;
  };

  get element() {
    return this.elementGroup;
  }

  updateState = (annotation) => {
    const { x, y, w, h } = parseRectFragment(annotation, this.env.image);
    this.setSize(x, y, w, h);
  };

  destroy() {
    this.containerGroup.parentNode.removeChild(this.containerGroup);
    super.destroy();
  }
}
