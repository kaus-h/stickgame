import t01 from '../../../assets/art/kit-0017/1x/t01-solid-infill.png?no-inline';
import t02 from '../../../assets/art/kit-0017/1x/t02-top-edge-a.png?no-inline';
import t03 from '../../../assets/art/kit-0017/1x/t03-top-edge-b.png?no-inline';
import t04 from '../../../assets/art/kit-0017/1x/t04-bottom-edge.png?no-inline';
import t05 from '../../../assets/art/kit-0017/1x/t05-left-edge.png?no-inline';
import t06 from '../../../assets/art/kit-0017/1x/t06-right-edge.png?no-inline';
import t07 from '../../../assets/art/kit-0017/1x/t07-interior-seam.png?no-inline';
import t08 from '../../../assets/art/kit-0017/1x/t08-outer-tl.png?no-inline';
import t09 from '../../../assets/art/kit-0017/1x/t09-outer-tr.png?no-inline';
import t10 from '../../../assets/art/kit-0017/1x/t10-outer-bl.png?no-inline';
import t11 from '../../../assets/art/kit-0017/1x/t11-outer-br.png?no-inline';
import t12 from '../../../assets/art/kit-0017/1x/t12-inner-tl.png?no-inline';
import t13 from '../../../assets/art/kit-0017/1x/t13-inner-tr.png?no-inline';
import t14 from '../../../assets/art/kit-0017/1x/t14-inner-bl.png?no-inline';
import t15 from '../../../assets/art/kit-0017/1x/t15-inner-br.png?no-inline';
import t16 from '../../../assets/art/kit-0017/1x/t16-vertical-wall-strip.png?no-inline';
import t17 from '../../../assets/art/kit-0017/1x/t17-wall-top-cap.png?no-inline';
import t18 from '../../../assets/art/kit-0017/1x/t18-wall-bottom-cap.png?no-inline';
import t19 from '../../../assets/art/kit-0017/1x/t19-left-wall-attachment.png?no-inline';
import t20 from '../../../assets/art/kit-0017/1x/t20-right-wall-attachment.png?no-inline';
import t21 from '../../../assets/art/kit-0017/1x/t21-ceiling-span.png?no-inline';
import t22 from '../../../assets/art/kit-0017/1x/t22-ceiling-left-join.png?no-inline';
import t23 from '../../../assets/art/kit-0017/1x/t23-ceiling-right-join.png?no-inline';
import t25 from '../../../assets/art/kit-0017/1x/t25-left-ledge-end.png?no-inline';
import t26 from '../../../assets/art/kit-0017/1x/t26-right-ledge-end.png?no-inline';
import t27 from '../../../assets/art/kit-0017/1x/t27-thin-solid-bridge.png?no-inline';
import t28 from '../../../assets/art/kit-0017/1x/t28-isolated-platform.png?no-inline';
import t34 from '../../../assets/art/kit-0017/1x/t34-pool-surface-span.png?no-inline';
import t35 from '../../../assets/art/kit-0017/1x/t35-pool-left-wall-join.png?no-inline';
import t36 from '../../../assets/art/kit-0017/1x/t36-pool-right-wall-join.png?no-inline';
import t37 from '../../../assets/art/kit-0017/1x/t37-pool-inner-left-corner.png?no-inline';
import t38 from '../../../assets/art/kit-0017/1x/t38-pool-inner-right-corner.png?no-inline';
import t39 from '../../../assets/art/kit-0017/1x/t39-pool-depth-fill.png?no-inline';

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
