import { useVideoPlayer } from '@/lib/video/hooks';
import { Scene1 } from './video_scenes/Scene1';
import { Scene2 } from './video_scenes/Scene2';
import { Scene3 } from './video_scenes/Scene3';
import { Scene4 } from './video_scenes/Scene4';
import { Scene5 } from './video_scenes/Scene5';
import './VideoTemplate.css';

const SCENE_DURATIONS = { open: 3000, scenario: 4000, conversation: 10000, coaching: 4000, close: 5000 };

export default function VideoTemplate() {
  const { currentScene } = useVideoPlayer({ durations: SCENE_DURATIONS });

  return (
    <div className="vt-root">
      <div className="vt-bg">
        <img
          src="/__mockup/images/cinematic-restaurant-bg.png"
          alt="Restaurant Background"
          className="vt-bg-img"
        />
        <div className="vt-bg-gradient" />
        <div className="vt-blob-orange" />
        <div className="vt-blob-blue" />
      </div>

      <div className="vt-midground" />

      <div className="vt-scenes">
        {currentScene === 0 && <Scene1 key="open" />}
        {currentScene === 1 && <Scene2 key="scenario" />}
        {currentScene === 2 && <Scene3 key="conversation" />}
        {currentScene === 3 && <Scene4 key="coaching" />}
        {currentScene === 4 && <Scene5 key="close" />}
      </div>
    </div>
  );
}
