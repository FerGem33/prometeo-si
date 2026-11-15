import { useRef } from "react";
import { Dots, FaceText, IsoFigure, Line, Plate, Solid, useInView, useLoop, useReadout } from "../iso";
import "../iso/iso.css";
import "../iso/theme-prometeo.css";
import { ART, H, RISE, TRAVEL, W } from "../iso/bench-geometry";

/** The moving assembly. The stem is painted before the housing and the sample after it, so the housing hides the stem's sunk part. */
function LiveSample({ rise, travel }: { rise: [number, number]; travel: number }) {
  const stem = useRef<SVGGElement>(null);
  const group = useRef<SVGGElement>(null);
  const flameRef = useRef<SVGGElement>(null);
  const { anchor, say } = useReadout<SVGGElement>();
  const inView = useInView(group);
  const time = useRef(0);
  const [fcx, fcy] = ART.sampleCenter;
  const [kx, ky] = ART.flame.core;

  useLoop((dt, calm) => {
    time.current += dt;
    const t = time.current;
    const lift = calm ? travel / 2 : (travel / 2) * (1 - Math.cos(t * 1.2));
    const move = `translate(${(rise[0] * lift).toFixed(2)} ${(rise[1] * lift).toFixed(2)})`;
    stem.current?.setAttribute("transform", move);
    group.current?.setAttribute("transform", move);

    if (flameRef.current) {
      const intensity = 0.85 + 0.3 * (lift / travel);
      const sx = calm ? 1 : intensity + Math.sin(t * 6.4) * 0.07;
      const sy = calm ? 1 : intensity * 1.05 + Math.cos(t * 5.8) * 0.1;
      // scale about the top of the sample, so the flame stays rooted on it
      flameRef.current.setAttribute(
        "transform",
        `translate(${(fcx * (1 - sx)).toFixed(2)} ${(fcy * (1 - sy)).toFixed(2)}) scale(${sx.toFixed(3)} ${sy.toFixed(3)})`,
      );
    }

    say(`lift ${lift.toFixed(0)} / ${travel} units`);
    return !calm;
  }, inView);

  return (
    <g ref={anchor}>
      <g ref={stem} data-tint="solar">
        <Solid paths={ART.stem} tone="mid" />
      </g>
      <g data-tint="violet">
        <Solid paths={ART.pedestal} tone="mid" inner={<Line d={ART.pedestalBands} tone="faint" />} />
        <Line d={ART.pedestalRim} tone="lo" />
      </g>
      <g ref={group}>
        <g data-tint="solar">
          <Solid paths={ART.collar} tone="mid" />
        </g>
        <g data-tint="amber">
          <Solid paths={ART.sample} tone="hi" lit inner={<Line d={ART.sampleBand} tone="faint" />} />
        </g>
        <Line d={ART.flameRingOuter} tone="red" flow />
        <Line d={ART.flameRingInner} tone="red" />
        <g ref={flameRef} className="bench-flame-kernel" data-part="bench-flame">
          <path className="iso-flame-tongue" data-tongue="side" d={ART.flame.left} />
          <path className="iso-flame-tongue" data-tongue="side" d={ART.flame.right} />
          <path className="iso-flame-tongue" data-tongue="main" d={ART.flame.main} />
          <path className="iso-flame-tongue" data-tongue="inner" d={ART.flame.inner} />
          <circle className="iso-flame-core" cx={kx} cy={ky} r="3.4" />
          <g data-flame-layer="sparks">
            <Dots points={ART.flame.sparks} size={1.5} tone="hi" pulse />
          </g>
        </g>
      </g>
    </g>
  );
}

export function IsoBenchFigure() {
  return (
    <div className="iso iso-prometeo iso-bench-wrap">
      <Plate
        fig="BENCH"
        title="Sample actuator & camera"
        hint="isometric geometry · live motion"
        readout={`lift 0 / ${TRAVEL} units`}
        keys={[
          { mark: "raised", label: "fixed bench" },
          { mark: "lit", label: "moving sample" },
          { mark: "dotted", label: "travel axis" },
          { mark: "red", label: "flame envelope" },
        ]}
        caption="Schematic 2:1 isometric drawing of a test bench: the sample travels along the vertical axis on a stem that slides inside the actuator housing, watched by a camera. Illustrative geometry, not a measurement."
      >
        <IsoFigure width={W} height={H} label="A fuel sample rising and falling on an actuator stem over a test bench, with a flame on top and a camera on a post.">
          {/* Our own deterministic geometry (no user input). */}
          <g className="iso-backdrop" dangerouslySetInnerHTML={{ __html: ART.floor }} />
          <Solid paths={ART.base} tone="mid" />
          <Solid paths={ART.deck} tone="lo" />
          <Dots points={ART.grid} />
          <Line d={ART.ticks.minor} tone="lo" />
          <Line d={ART.ticks.major} tone="mid" />
          <FaceText transform={ART.label} size={5} tone="mid">
            PROMETEO
          </FaceText>
          <g data-tint="solar">
            <Solid paths={ART.postFoot} tone="mid" />
            <Solid paths={ART.post} tone="mid" />
          </g>
          <g data-tint="glass">
            <Solid paths={ART.lens} tone="mid" inner={<Line d={ART.lensGlass} tone="lo" />} />
          </g>
          <g data-tint="cyan">
            <Solid paths={ART.head} tone="mid" />
          </g>
          <Line d={ART.guide} tone="blue" dotted />
          <LiveSample rise={RISE} travel={TRAVEL} />
        </IsoFigure>
      </Plate>
    </div>
  );
}
