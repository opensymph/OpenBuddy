/**
 * Icon — clean port of WorkBuddy's foundation/components/Icon/Icon.tsx.
 *
 * `createIcon(asset, defaults?)` turns an icon asset into a named React
 * component. The asset may be:
 *   - a forwardRef SVG component (the common case) — rendered via <Comp/>
 *   - an object `{ url, themable?, alt? }` — rendered as an <img/>
 *
 * Usage (see icons/*.tsx):
 *   const FooRaw = forwardRef((props, ref) => <svg ref={ref} {...props}>...</svg>);
 *   export const Foo = createIcon(FooRaw);
 *
 * Then: <Foo size="md" color="var(--wb-text-strong)" />
 */
import {
  forwardRef,
  type CSSProperties,
  type ComponentType,
  type Ref,
} from "react";

export type IconSize = "sm" | "md" | "lg" | "xl";

export const SIZE_MAP: Record<IconSize, number> = {
  sm: 14,
  md: 16,
  lg: 20,
  xl: 24,
};

export interface IconAsset {
  url: string;
  themable?: boolean;
  alt?: string;
}

export interface IconComponentProps extends Record<string, any> {
  ref?: Ref<SVGSVGElement>;
  size?: IconSize | number;
  width?: number | string;
  height?: number | string;
  color?: string;
  spin?: boolean;
  rotate?: number;
  strokeWidth?: number | string;
  className?: string;
  style?: CSSProperties;
  active?: boolean;
  children?: React.ReactNode;
}

function resolveSize(size: IconSize | number | string | undefined) {
  if (size === undefined || size === null) return undefined;
  if (typeof size === "number") return size;
  if (typeof size === "string" && size in SIZE_MAP) return SIZE_MAP[size as IconSize];
  return size;
}

export const Icon = forwardRef<SVGSVGElement, IconComponentProps>(function Icon(props, ref) {
  const {
    component,
    size = "md",
    width,
    height,
    color,
    spin,
    rotate,
    strokeWidth,
    className,
    style,
    children,
    active: _active,
    ...rest
  } = props as IconComponentProps & { component?: ComponentType<any> | IconAsset };

  const resolvedW = resolveSize(width ?? size);
  const resolvedH = resolveSize(height ?? size);

  const merged: CSSProperties = {
    ...(color ? { color } : null),
    ...(rotate && !spin ? { transform: `rotate(${rotate}deg)` } : null),
    ...style,
  };

  const cls = ["wb-icon", spin ? "wb-icon--spin" : "", className]
    .filter(Boolean)
    .join(" ");

  // Asset form: { url, themable, alt } -> render as <img/>.
  if (component && typeof component === "object" && "url" in component) {
    const { url, themable, alt } = component;
    const imgClass = [cls, themable ? "wb-icon--themable" : ""]
      .filter(Boolean)
      .join(" ");
    return (
      <img
        ref={ref as Ref<HTMLImageElement>}
        src={url}
        alt={alt ?? ""}
        aria-hidden={alt ? undefined : true}
        width={resolvedW as any}
        height={resolvedH as any}
        className={imgClass}
        style={merged}
        draggable={false}
      />
    );
  }

  // Component form: render the forwarded SVG component.
  if (component) {
    const Comp = component as ComponentType<any>;
    return (
      <Comp
        ref={ref}
        width={resolvedW as any}
        height={resolvedH as any}
        className={cls}
        style={merged}
        aria-hidden={true}
        {...(strokeWidth !== undefined ? { strokeWidth } : null)}
        {...rest}
      >
        {children}
      </Comp>
    );
  }

  // Raw svg form: render an <svg> directly with children.
  return (
    <svg
      ref={ref}
      width={resolvedW as any}
      height={resolvedH as any}
      className={cls}
      style={merged}
      aria-hidden={true}
      xmlns="http://www.w3.org/2000/svg"
      {...rest}
    >
      {children}
    </svg>
  );
});

export interface CreateIconDefaults {
  size?: IconSize | number;
  strokeWidth?: number | string;
  color?: string;
  activeAsset?: ComponentType<any> | IconAsset;
}

/**
 * Factory: freeze an icon asset into a named component.
 * Mirrors antd's generated `<HomeOutlined />` pattern.
 */
export function createIcon(
  asset: ComponentType<any> | IconAsset,
  defaults?: CreateIconDefaults
) {
  const GeneratedIcon = forwardRef<SVGSVGElement, IconComponentProps>(
    function GeneratedIcon(props, ref) {
      const { active, ...rest } = props;
      const resolvedAsset =
        active && defaults?.activeAsset ? defaults.activeAsset : asset;
      return (
        <Icon
          ref={ref}
          component={resolvedAsset as any}
          size={props.size ?? defaults?.size}
          strokeWidth={props.strokeWidth ?? defaults?.strokeWidth}
          color={props.color ?? defaults?.color}
          {...rest}
        />
      );
    }
  );
  return GeneratedIcon;
}
