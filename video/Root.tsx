import { Composition, type CalculateMetadataFunction } from "remotion";
import { StoryShort, type StoryShortProps } from "./StoryShort";
import sample from "./sample-props.json";

const FPS = 30;

// voiceover + 0.3s lead-in + 2.2s outro
const calculateMetadata: CalculateMetadataFunction<StoryShortProps> = ({ props }) => ({
  durationInFrames: Math.ceil(((props.durationMs + 2500) / 1000) * FPS),
  props,
});

export function RemotionRoot() {
  return (
    <Composition
      id="StoryShort"
      component={StoryShort}
      width={1080}
      height={1920}
      fps={FPS}
      defaultProps={sample as StoryShortProps}
      calculateMetadata={calculateMetadata}
    />
  );
}
