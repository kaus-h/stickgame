import t01 from '../../../assets/art/kit-0017/runtime/t01-solid-infill.webp?no-inline';
import t02 from '../../../assets/art/kit-0017/runtime/t02-top-edge-a.webp?no-inline';
import t03 from '../../../assets/art/kit-0017/runtime/t03-top-edge-b.webp?no-inline';
import t04 from '../../../assets/art/kit-0017/runtime/t04-bottom-edge.webp?no-inline';
import t05 from '../../../assets/art/kit-0017/runtime/t05-left-edge.webp?no-inline';
import t06 from '../../../assets/art/kit-0017/runtime/t06-right-edge.webp?no-inline';
import t07 from '../../../assets/art/kit-0017/runtime/t07-interior-seam.webp?no-inline';
import t08 from '../../../assets/art/kit-0017/runtime/t08-outer-tl.webp?no-inline';
import t09 from '../../../assets/art/kit-0017/runtime/t09-outer-tr.webp?no-inline';
import t10 from '../../../assets/art/kit-0017/runtime/t10-outer-bl.webp?no-inline';
import t11 from '../../../assets/art/kit-0017/runtime/t11-outer-br.webp?no-inline';
import t12 from '../../../assets/art/kit-0017/runtime/t12-inner-tl.webp?no-inline';
import t13 from '../../../assets/art/kit-0017/runtime/t13-inner-tr.webp?no-inline';
import t14 from '../../../assets/art/kit-0017/runtime/t14-inner-bl.webp?no-inline';
import t15 from '../../../assets/art/kit-0017/runtime/t15-inner-br.webp?no-inline';
import t16 from '../../../assets/art/kit-0017/runtime/t16-vertical-wall-strip.webp?no-inline';
import t17 from '../../../assets/art/kit-0017/runtime/t17-wall-top-cap.webp?no-inline';
import t18 from '../../../assets/art/kit-0017/runtime/t18-wall-bottom-cap.webp?no-inline';
import t19 from '../../../assets/art/kit-0017/runtime/t19-left-wall-attachment.webp?no-inline';
import t20 from '../../../assets/art/kit-0017/runtime/t20-right-wall-attachment.webp?no-inline';
import t21 from '../../../assets/art/kit-0017/runtime/t21-ceiling-span.webp?no-inline';
import t22 from '../../../assets/art/kit-0017/runtime/t22-ceiling-left-join.webp?no-inline';
import t23 from '../../../assets/art/kit-0017/runtime/t23-ceiling-right-join.webp?no-inline';
import t25 from '../../../assets/art/kit-0017/runtime/t25-left-ledge-end.webp?no-inline';
import t26 from '../../../assets/art/kit-0017/runtime/t26-right-ledge-end.webp?no-inline';
import t27 from '../../../assets/art/kit-0017/runtime/t27-thin-solid-bridge.webp?no-inline';
import t28 from '../../../assets/art/kit-0017/runtime/t28-isolated-platform.webp?no-inline';
import t34 from '../../../assets/art/kit-0017/runtime/t34-pool-surface-span.webp?no-inline';
import t35 from '../../../assets/art/kit-0017/runtime/t35-pool-left-wall-join.webp?no-inline';
import t36 from '../../../assets/art/kit-0017/runtime/t36-pool-right-wall-join.webp?no-inline';
import t37 from '../../../assets/art/kit-0017/runtime/t37-pool-inner-left-corner.webp?no-inline';
import t38 from '../../../assets/art/kit-0017/runtime/t38-pool-inner-right-corner.webp?no-inline';
import t39 from '../../../assets/art/kit-0017/runtime/t39-pool-depth-fill.webp?no-inline';

const urls: Record<string, string> = {
  t01,
  t02,
  t03,
  t04,
  t05,
  t06,
  t07,
  t08,
  t09,
  t10,
  t11,
  t12,
  t13,
  t14,
  t15,
  t16,
  t17,
  t18,
  t19,
  t20,
  t21,
  t22,
  t23,
  t25,
  t26,
  t27,
  t28,
  t34,
  t35,
  t36,
  t37,
  t38,
  t39,
};

/** One shared compact URL table avoids repeating the full authoring paths in both painters. */
export function kit17AssetUrl(name: string): string {
  const url = urls[name.slice(0, 3)];
  if (!url) throw new Error(`Missing kit 0017 asset: ${name}`);
  return url;
}
