import Phaser from "phaser";
import { HEIGHT, WIDTH } from "./layout";

export class StartScene extends Phaser.Scene {
  constructor() {
    super("start");
  }

  preload(): void {
    this.load.image("start_bg", "assets/ui/start_bg.jpg");
    this.load.image("game_logo", "assets/ui/game_logo.jpg");
  }

  create(): void {
    const bg = this.add.image(WIDTH / 2, HEIGHT / 2, "start_bg");
    const scale = Math.max(WIDTH / bg.width, HEIGHT / bg.height);
    bg.setScale(scale);

    // Our epic AI generated game logo!
    const titleImg = this.add.image(WIDTH / 2, HEIGHT * 0.20, "game_logo");
    // BlendMode.SCREEN makes pure black transparent!
    titleImg.setBlendMode(Phaser.BlendModes.SCREEN);
    titleImg.setScale(0.9);

    // Subtitle
    this.add.text(WIDTH / 2, HEIGHT * 0.38, "ليلة الأربعين", {
      fontFamily: "Amiri, serif",
      fontSize: "40px",
      color: "#ffffff",
      align: "center",
      shadow: { offsetX: 0, offsetY: 4, color: "rgba(0,0,0,0.8)", blur: 8, fill: true }
    }).setOrigin(0.5);

    // Button
    const btnW = 340;
    const btnH = 80;
    const btnY = HEIGHT * 0.82;
    const btnContainer = this.add.container(WIDTH / 2, btnY);

    const btnBg = this.add.graphics();
    const drawBtn = (isHover) => {
      btnBg.clear();
      btnBg.fillStyle(0x000000, isHover ? 0.8 : 0.6);
      btnBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 40);
      btnBg.lineStyle(2, isHover ? 0xffffff : 0xd4af37, 1);
      btnBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 40);
    };
    drawBtn(false);

    const btnText = this.add.text(0, -4, "ادخل الديوانية", {
      fontFamily: "Amiri, serif",
      fontSize: "36px",
      color: "#ffffff",
      shadow: { offsetX: 0, offsetY: 2, color: "rgba(0,0,0,0.8)", blur: 4, fill: true }
    }).setOrigin(0.5);

    btnContainer.add([btnBg, btnText]);

    this.add.text(WIDTH / 2, btnY + 70, "الأبواب مفتوحة حتى الفجر", {
      fontFamily: "Tajawal, sans-serif",
      fontSize: "18px",
      color: "#dddddd",
      align: "center",
      shadow: { offsetX: 0, offsetY: 2, color: "rgba(0,0,0,0.8)", blur: 4, fill: true }
    }).setOrigin(0.5);

    btnContainer.setSize(btnW, btnH);
    btnContainer.setInteractive(new Phaser.Geom.Rectangle(-btnW/2, -btnH/2, btnW, btnH), Phaser.Geom.Rectangle.Contains);
    btnContainer.input.cursor = "pointer";
    
    btnContainer.on("pointerover", () => {
      this.tweens.add({ targets: btnContainer, scale: 1.05, duration: 150 });
      drawBtn(true);
    });

    btnContainer.on("pointerout", () => {
      this.tweens.add({ targets: btnContainer, scale: 1, duration: 150 });
      drawBtn(false);
    });

    btnContainer.on("pointerdown", () => {
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        this.scene.start("map");
      });
    });
  }
}
