import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  HostListener,
} from '@angular/core';
import { NgIf } from '@angular/common';

interface Obstacle {
  x: number;
  y: number;
  size: number;
  speed: { x: number; y: number };
  rotation: number;
  rotationSpeed: number;
  type: 'asteroid' | 'blackhole' | 'alien';
  currentSize?: number;
  createdAt?: number;
  state?: 'growing' | 'stable' | 'shrinking';
  initialY?: number;
  amplitude?: number;
  frequency?: number;
}

interface Collectible {
  x: number;
  y: number;
  type: number; // Index du sprite (0-335)
  rotation: number;
  collected: boolean;
  value: number;
  effect?: 'score' | 'speed' | 'shield' | 'size' | 'multiplier';
  auraRotation: number; // Ajout de la rotation de l'aura
  auraScale: number; // Ajout de l'échelle de l'aura
}

interface Particle {
  x: number;
  y: number;
  speed: { x: number; y: number };
  size: number;
  color: string;
  alpha: number;
  rotation: number;
}

@Component({
  selector: 'app-game',
  template: `
    <div class="game-container">
      <div class="parallax-background" #parallaxBg></div>
      <canvas #gameCanvas></canvas>
      <div class="game-info" *ngIf="isGameStarted && !isGameOver">
        <div class="score">
          Score: {{ score }}
          <span class="multiplier" *ngIf="scoreMultiplier > 1">
            (×{{ scoreMultiplier.toFixed(1) }})
          </span>
        </div>
        <div class="survival-time">{{ formatTime(survivalTime) }}</div>
        <div class="speed-bonus" *ngIf="speedBonusActive">
          Ralentissement: {{ getSpeedBonusTimeLeft().toFixed(1) }}s
        </div>
      </div>
      <div class="start-message" *ngIf="!isGameStarted">
        Appuyez sur une touche pour commencer
      </div>
      <div class="pause-message" *ngIf="isPaused && !isGameOver">
        Jeu en pause
      </div>
      <div class="game-over" *ngIf="isGameOver">
        <div class="game-over-title">Game Over</div>
        <div class="game-over-score">
          <div>Score final: {{ score }}</div>
          <div>Temps de survie: {{ formatTime(survivalTime) }}</div>
        </div>
        <div class="game-over-restart">Appuyez sur ESPACE pour recommencer</div>
      </div>
    </div>
  `,
  styles: [
    `
      .game-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background-image: url('/assets/images/stars.png');
        background-size: 120% 120%; /* Agrandi pour permettre le décalage */
        background-position: center;
        background-repeat: no-repeat;
        perspective: 1000px;
        overflow: hidden;
      }
      .parallax-background {
        position: absolute;
        top: -10%;
        left: -10%;
        width: 120%;
        height: 120%;
        background-image: url('/assets/images/stars.png');
        background-size: cover;
        background-position: center;
        transform-style: preserve-3d;
        transition: transform 0.1s ease-out;
      }
      canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        cursor: default;
      }
      canvas.playing {
        cursor: none;
      }
      .game-info {
        position: absolute;
        top: 20px;
        right: 20px;
        color: white;
        font-family: 'Arial', sans-serif;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        text-align: right;
      }
      .score {
        font-size: 32px;
        font-weight: bold;
        margin-bottom: 5px;
        color: #ffdd57;
      }
      .survival-time {
        font-size: 24px;
      }
      .start-message {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 24px;
        font-family: Arial, sans-serif;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        pointer-events: none;
      }
      .pause-message {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        font-size: 48px;
        font-family: Arial, sans-serif;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
        pointer-events: none;
        text-transform: uppercase;
        font-weight: bold;
      }
      .game-over {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: white;
        text-align: center;
        text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
      }
      .game-over-title {
        font-size: 72px;
        font-weight: bold;
        margin-bottom: 20px;
        color: #ff4136;
      }
      .game-over-score {
        font-size: 36px;
        margin-bottom: 20px;
        > div {
          margin: 10px 0;
        }
      }
      .game-over-restart {
        font-size: 24px;
        opacity: 0.8;
      }
      .multiplier {
        font-size: 18px;
        color: #ff00ff;
        margin-left: 8px;
        opacity: 0.8;
      }
      .speed-bonus {
        font-size: 18px;
        color: #00ffff;
        margin-top: 5px;
        opacity: 0.8;
      }
    `,
  ],
  standalone: true,
  imports: [NgIf],
})
export class GameComponent implements AfterViewInit {
  @ViewChild('parallaxBg') parallaxBg!: ElementRef<HTMLDivElement>;
  @ViewChild('gameCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private ctx!: CanvasRenderingContext2D;
  public isGameStarted = false;
  public isPaused = false;
  private spaceshipImage: HTMLImageElement;
  private spaceshipSize = { width: 80, height: 80 };

  // Chronomètre
  public survivalTime = 0;
  private lastTimestamp = 0;

  // Position et vitesse du vaisseau
  private position = { x: 0, y: 0 };
  private velocity = { x: 0, y: 0 };
  private mousePosition = { x: 0, y: 0 };
  private rotation = 0;
  private readonly ACCELERATION = 0.005;
  private readonly FRICTION = 0.9;
  private readonly MIN_ROTATION_DISTANCE = 5;

  // Gestion des obstacles
  private obstacles: Obstacle[] = [];
  private readonly MIN_OBSTACLE_SIZE = 40;
  private readonly MAX_OBSTACLE_SIZE = 80;
  private readonly BASE_MIN_OBSTACLE_SPEED = 1;
  private readonly BASE_MAX_OBSTACLE_SPEED = 3;
  private readonly BASE_SPAWN_INTERVAL = 2000;
  private lastObstacleSpawn = 0;

  // Gestion de la difficulté
  private readonly DIFFICULTY_INCREASE_INTERVAL = 10000; // Augmentation toutes les 10 secondes
  private readonly MAX_DIFFICULTY_MULTIPLIER = 3; // Vitesse max = 3x la vitesse initiale
  private readonly MIN_SPAWN_INTERVAL = 500; // Temps minimum entre les obstacles

  private obstacleImage: HTMLImageElement;
  private readonly MIN_ROTATION_SPEED = 0.02;
  private readonly MAX_ROTATION_SPEED = 0.05;

  public isGameOver = false;

  // Constantes pour les trous noirs
  private readonly BLACKHOLE_GROWTH_DURATION = 2000; // 2 secondes pour grandir
  private readonly BLACKHOLE_STABLE_DURATION = 3000; // 3 secondes de stabilité
  private readonly BLACKHOLE_SHRINK_DURATION = 1000; // 1 seconde pour disparaître
  private blackholeImage: HTMLImageElement;
  private blackholeImageLoaded = false;

  private readonly MAX_TILT = 5; // Angle maximum de rotation en degrés

  private alienImage: HTMLImageElement;
  private alienImageLoaded = false;

  // Constantes pour l'alien
  private readonly ALIEN_SIZE = 60;
  private readonly ALIEN_SPEED = 3;
  private readonly ALIEN_AMPLITUDE = 100; // Amplitude de la sinusoïdale
  private readonly ALIEN_FREQUENCY = 0.005; // Fréquence de la sinusoïdale

  public score = 0;

  private oresImage: HTMLImageElement;
  private oresImageLoaded = false;
  private collectibles: Collectible[] = [];

  // Constantes pour les sprites
  private readonly SPRITE_SIZE = 32;
  private readonly SPRITES_PER_ROW = 7;
  private readonly COLLECTIBLE_SIZE = 40; // Taille affichée
  private readonly SPAWN_COLLECTIBLE_INTERVAL = 5000; // 5 secondes au lieu de 10
  private lastCollectibleSpawn = 0;

  // Définition des types de collectibles
  private readonly COLLECTIBLE_TYPES = [
    { type: 0, value: 100, effect: 'score' }, // Or
    { type: 1, value: 200, effect: 'score' }, // Argent
    { type: 2, value: 300, effect: 'score' }, // Bronze
    { type: 7, value: 500, effect: 'score' }, // Rubis
    { type: 8, value: 1.5, effect: 'multiplier' }, // Multiplicateur de score
    { type: 14, value: 1.2, effect: 'speed' }, // Bonus de vitesse
    { type: 15, value: 10, effect: 'shield' }, // Bouclier temporaire
    // On peut en ajouter d'autres...
  ] as const;

  private readonly AURA_ROTATION_SPEED = 0.02;
  private readonly AURA_PULSE_SPEED = 0.003;
  private readonly AURA_MIN_SCALE = 1.2;
  private readonly AURA_MAX_SCALE = 1.4;

  private particles: Particle[] = [];
  private readonly PARTICLE_COUNT = 12;
  private readonly PARTICLE_SPEED = 5;
  private readonly PARTICLE_DECAY = 0.02;
  private readonly PARTICLE_SIZE = 8;

  public scoreMultiplier = 1;

  // Propriétés pour le bonus de vitesse
  public speedBonusActive = false;
  public speedBonusEndTime = 0;
  private readonly SPEED_BONUS_DURATION = 5000; // 5 secondes

  // Propriétés pour le bouclier
  private hasShield = false;
  private shieldRadius = 50;
  private shieldOpacity = 0;
  private readonly SHIELD_MAX_OPACITY = 0.4;
  private readonly SHIELD_FADE_SPEED = 0.05;
  private shieldBreakParticles: Particle[] = [];
  private readonly SHIELD_BREAK_PARTICLE_COUNT = 20;
  private readonly SHIELD_BREAK_PARTICLE_SPEED = 8;
  private readonly SHIELD_BREAK_PARTICLE_SIZE = 3;
  private readonly SHIELD_BREAK_PARTICLE_COLORS = [
    '#4169e1',
    '#00ffff',
    '#ffffff',
  ];

  constructor() {
    this.spaceshipImage = new Image();
    this.spaceshipImage.src = './assets/images/spaceship.png';

    this.obstacleImage = new Image();
    this.obstacleImage.src = './assets/images/obstacle.png';

    this.blackholeImage = new Image();
    this.blackholeImage.onload = () => {
      this.blackholeImageLoaded = true;
    };
    this.blackholeImage.src = './assets/images/blackhole.png';

    this.alienImage = new Image();
    this.alienImage.onload = () => {
      this.alienImageLoaded = true;
    };
    this.alienImage.src = './assets/images/alien.png';

    this.oresImage = new Image();
    this.oresImage.onload = () => {
      this.oresImageLoaded = true;
    };
    this.oresImage.src = './assets/images/ores.png';

    this.position = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
  }

  ngAfterViewInit(): void {
    this.initCanvas();
    this.gameLoop(0);
  }

  @HostListener('window:keydown', ['$event'])
  onKeyPress(event: KeyboardEvent): void {
    if (!this.isGameStarted) {
      this.startGame();
      return;
    }

    if (event.code === 'Space') {
      if (this.isGameOver) {
        this.startGame();
      } else {
        this.togglePause();
      }
      event.preventDefault();
    }
  }

  @HostListener('click')
  onClick(): void {
    if (!this.isGameStarted && !this.isGameOver) {
      this.startGame();
    }
  }

  @HostListener('mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    this.mousePosition = {
      x: event.clientX,
      y: event.clientY,
    };
  }

  @HostListener('mouseleave')
  onMouseLeave(): void {
    if (this.isGameStarted && !this.isPaused) {
      this.togglePause();
    }
  }

  // Méthode pour mettre en pause
  togglePause(): void {
    this.isPaused = !this.isPaused;
    if (!this.isPaused) {
      this.lastTimestamp = performance.now();
    } else {
      // Réinitialisation du parallaxe en pause
      const parallaxElement = this.parallaxBg.nativeElement;
      parallaxElement.style.transform =
        'rotateX(0deg) rotateY(0deg) translate3d(0, 0, 0)';
    }
    this.updateGameState();
  }

  public formatTime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
      .toString()
      .padStart(2, '0')}`;
  }

  private updateTime(timestamp: number): void {
    if (this.isGameStarted && !this.isPaused) {
      const deltaTime = timestamp - this.lastTimestamp;
      this.survivalTime += deltaTime;
      this.lastTimestamp = timestamp;
    }
  }

  private initCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    this.ctx = canvas.getContext('2d')!;
    this.resizeCanvas();
  }

  @HostListener('window:resize')
  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  private updateParallax(): void {
    if (!this.isGameStarted || this.isPaused) return;

    const parallaxElement = this.parallaxBg.nativeElement;

    // Calcul de la position relative du vaisseau (de -1 à 1)
    const relativeX = (this.position.x / window.innerWidth) * 2 - 1;
    const relativeY = (this.position.y / window.innerHeight) * 2 - 1;

    // Calcul des angles de rotation
    const rotateX = -relativeY * this.MAX_TILT; // Inverse Y pour un effet naturel
    const rotateY = relativeX * this.MAX_TILT;

    // Application de la transformation avec un léger décalage de translation
    const translateX = -relativeX * 2;
    const translateY = -relativeY * 2;

    parallaxElement.style.transform = `
      rotateX(${rotateX}deg) 
      rotateY(${rotateY}deg)
      translate3d(${translateX}%, ${translateY}%, 0)
    `;
  }

  private updateSpaceshipPosition(): void {
    if (!this.isGameStarted) return;

    // Calcul du vecteur direction vers la souris
    const dx = this.mousePosition.x - this.position.x;
    const dy = this.mousePosition.y - this.position.y;

    // Calcul de la distance
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Mise à jour de la rotation seulement si on est assez loin
    if (distance > this.MIN_ROTATION_DISTANCE) {
      this.rotation = Math.atan2(dy, dx) + Math.PI / 2;
    }

    // Application de l'accélération
    this.velocity.x += dx * this.ACCELERATION;
    this.velocity.y += dy * this.ACCELERATION;

    // Application de la friction
    this.velocity.x *= this.FRICTION;
    this.velocity.y *= this.FRICTION;

    // Mise à jour de la position
    this.position.x += this.velocity.x;
    this.position.y += this.velocity.y;

    // Limites de l'écran
    this.position.x = Math.max(
      this.spaceshipSize.width / 2,
      Math.min(
        window.innerWidth - this.spaceshipSize.width / 2,
        this.position.x
      )
    );
    this.position.y = Math.max(
      this.spaceshipSize.height / 2,
      Math.min(
        window.innerHeight - this.spaceshipSize.height / 2,
        this.position.y
      )
    );

    // Ajout de la mise à jour du parallaxe après la mise à jour de la position
    this.updateParallax();
  }

  private drawSpaceship(): void {
    this.ctx.save();

    // Translation au centre du vaisseau
    this.ctx.translate(this.position.x, this.position.y);

    // Rotation
    this.ctx.rotate(this.rotation);

    // Dessin du vaisseau centré sur son origine
    this.ctx.drawImage(
      this.spaceshipImage,
      -this.spaceshipSize.width / 2,
      -this.spaceshipSize.height / 2,
      this.spaceshipSize.width,
      this.spaceshipSize.height
    );

    this.ctx.restore();
  }

  private getDifficultyMultiplier(): number {
    const difficultyLevel = Math.floor(
      this.survivalTime / this.DIFFICULTY_INCREASE_INTERVAL
    );
    return Math.min(1 + difficultyLevel * 0.2, this.MAX_DIFFICULTY_MULTIPLIER);
  }

  private getCurrentSpawnInterval(): number {
    const multiplier = this.getDifficultyMultiplier();
    return Math.max(
      this.BASE_SPAWN_INTERVAL / multiplier,
      this.MIN_SPAWN_INTERVAL
    );
  }

  private spawnObstacle(): void {
    const random = Math.random();
    if (random < 0.15) {
      // 15% de chance pour un alien
      this.spawnAlien();
    } else if (random < 0.35) {
      // 20% de chance pour un trou noir
      this.spawnBlackHole();
    } else {
      // 65% de chance pour un astéroïde
      this.spawnAsteroid();
    }
  }

  private spawnBlackHole(): void {
    // Pour les trous noirs, on utilise une taille de base plus grande
    const baseSize = this.MIN_OBSTACLE_SIZE * 2; // Taille minimale doublée pour les trous noirs
    const size = baseSize + Math.random() * baseSize; // Variation de +100% max

    // Position aléatoire mais pas trop près des bords
    const margin = size * 2;
    const x = margin + Math.random() * (window.innerWidth - 2 * margin);
    const y = margin + Math.random() * (window.innerHeight - 2 * margin);

    this.obstacles.push({
      x,
      y,
      size,
      speed: { x: 0, y: 0 }, // Les trous noirs sont statiques
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed:
        Math.random() * (this.MAX_ROTATION_SPEED - this.MIN_ROTATION_SPEED) +
        this.MIN_ROTATION_SPEED,
      type: 'blackhole',
      currentSize: 0, // Commence invisible
      createdAt: performance.now(),
      state: 'growing',
    });
  }

  private spawnAsteroid(): void {
    const size =
      Math.random() * (this.MAX_OBSTACLE_SIZE - this.MIN_OBSTACLE_SIZE) +
      this.MIN_OBSTACLE_SIZE;
    const multiplier = this.getDifficultyMultiplier();
    const currentMaxSpeed = this.BASE_MAX_OBSTACLE_SPEED * multiplier;
    const currentMinSpeed = this.BASE_MIN_OBSTACLE_SPEED * multiplier;

    // Choix aléatoire du côté d'apparition (haut, bas, gauche, droite)
    const side = Math.floor(Math.random() * 4);
    let x: number, y: number;
    let speedX: number, speedY: number;

    switch (side) {
      case 0: // Haut
        x = Math.random() * window.innerWidth;
        y = -size;
        speedX = (Math.random() - 0.5) * currentMaxSpeed;
        speedY =
          Math.random() * (currentMaxSpeed - currentMinSpeed) + currentMinSpeed;
        break;
      case 1: // Droite
        x = window.innerWidth + size;
        y = Math.random() * window.innerHeight;
        speedX = -(
          Math.random() * (currentMaxSpeed - currentMinSpeed) +
          currentMinSpeed
        );
        speedY = (Math.random() - 0.5) * currentMaxSpeed;
        break;
      case 2: // Bas
        x = Math.random() * window.innerWidth;
        y = window.innerHeight + size;
        speedX = (Math.random() - 0.5) * currentMaxSpeed;
        speedY = -(
          Math.random() * (currentMaxSpeed - currentMinSpeed) +
          currentMinSpeed
        );
        break;
      default: // Gauche
        x = -size;
        y = Math.random() * window.innerHeight;
        speedX =
          Math.random() * (currentMaxSpeed - currentMinSpeed) + currentMinSpeed;
        speedY = (Math.random() - 0.5) * currentMaxSpeed;
    }

    // Vitesse de rotation aléatoire
    const rotationSpeed =
      Math.random() * (this.MAX_ROTATION_SPEED - this.MIN_ROTATION_SPEED) +
      this.MIN_ROTATION_SPEED;
    const rotationDirection = Math.random() < 0.5 ? 1 : -1;

    // Spawn multiple d'obstacles en fonction de la difficulté
    const numberOfObstacles = Math.floor(Math.random() * (multiplier - 1) + 1);

    for (let i = 0; i < numberOfObstacles; i++) {
      const offsetX = (Math.random() - 0.5) * 100;
      const offsetY = (Math.random() - 0.5) * 100;

      this.obstacles.push({
        x: x + offsetX,
        y: y + offsetY,
        size,
        speed: { x: speedX, y: speedY },
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: rotationSpeed * rotationDirection,
        type: 'asteroid',
      });
    }
  }

  private spawnAlien(): void {
    // Décide si l'alien va de gauche à droite ou de droite à gauche
    const goingRight = Math.random() < 0.5;
    const x = goingRight
      ? -this.ALIEN_SIZE
      : window.innerWidth + this.ALIEN_SIZE;
    const y =
      this.ALIEN_SIZE +
      Math.random() * (window.innerHeight - 2 * this.ALIEN_SIZE);

    this.obstacles.push({
      x,
      y,
      size: this.ALIEN_SIZE,
      speed: {
        x: goingRight ? this.ALIEN_SPEED : -this.ALIEN_SPEED,
        y: 0,
      },
      rotation: goingRight ? 0 : Math.PI, // Rotation en fonction de la direction
      rotationSpeed: 0,
      type: 'alien',
      initialY: y,
      amplitude: this.ALIEN_AMPLITUDE,
      frequency: this.ALIEN_FREQUENCY,
    });
  }

  private updateObstacles(): void {
    const currentTime = performance.now();

    // Vérifier si le bonus de vitesse est terminé
    if (this.speedBonusActive && currentTime > this.speedBonusEndTime) {
      this.speedBonusActive = false;
    }

    this.obstacles = this.obstacles.filter((obstacle) => {
      if (obstacle.type === 'alien') {
        // Mise à jour de la position sinusoïdale
        obstacle.x += obstacle.speed.x;
        obstacle.y =
          obstacle.initialY! +
          Math.sin(obstacle.x * obstacle.frequency!) * obstacle.amplitude!;

        // Garde l'alien si il est encore dans les limites de l'écran avec une marge
        const margin = obstacle.size * 2;
        return !(
          obstacle.x < -margin || obstacle.x > window.innerWidth + margin
        );
      }

      if (obstacle.type === 'blackhole') {
        const age = currentTime - obstacle.createdAt!;

        // Mise à jour de l'état du trou noir
        if (age < this.BLACKHOLE_GROWTH_DURATION) {
          obstacle.state = 'growing';
          obstacle.currentSize =
            (age / this.BLACKHOLE_GROWTH_DURATION) * obstacle.size;
        } else if (
          age <
          this.BLACKHOLE_GROWTH_DURATION + this.BLACKHOLE_STABLE_DURATION
        ) {
          obstacle.state = 'stable';
          obstacle.currentSize = obstacle.size;
        } else if (
          age <
          this.BLACKHOLE_GROWTH_DURATION +
            this.BLACKHOLE_STABLE_DURATION +
            this.BLACKHOLE_SHRINK_DURATION
        ) {
          obstacle.state = 'shrinking';
          const shrinkAge =
            age -
            (this.BLACKHOLE_GROWTH_DURATION + this.BLACKHOLE_STABLE_DURATION);
          obstacle.currentSize =
            obstacle.size * (1 - shrinkAge / this.BLACKHOLE_SHRINK_DURATION);
        } else {
          return false; // Supprime le trou noir
        }

        return true;
      }

      // Code existant pour les astéroïdes
      const margin = obstacle.size * 2;
      return !(
        obstacle.x < -margin ||
        obstacle.x > window.innerWidth + margin ||
        obstacle.y < -margin ||
        obstacle.y > window.innerHeight + margin
      );
    });

    // Mise à jour des positions et rotations
    this.obstacles.forEach((obstacle) => {
      if (obstacle.type === 'asteroid' || obstacle.type === 'alien') {
        // Appliquer le ralentissement si le bonus est actif
        const speedMultiplier = this.speedBonusActive ? 0.5 : 1;
        obstacle.x += obstacle.speed.x * speedMultiplier;
        obstacle.y += obstacle.speed.y * speedMultiplier;
      }
      obstacle.rotation += obstacle.rotationSpeed;
    });
  }

  private drawObstacles(): void {
    this.obstacles.forEach((obstacle) => {
      this.ctx.save();
      this.ctx.translate(obstacle.x, obstacle.y);
      this.ctx.rotate(obstacle.rotation);

      if (obstacle.type === 'alien' && this.alienImageLoaded) {
        this.ctx.drawImage(
          this.alienImage,
          -obstacle.size / 2,
          -obstacle.size / 2,
          obstacle.size,
          obstacle.size
        );
      } else if (obstacle.type === 'blackhole' && this.blackholeImageLoaded) {
        // Dessiner le trou noir avec un effet de transparence
        this.ctx.globalAlpha = obstacle.state === 'stable' ? 1 : 0.7;
        const size = obstacle.currentSize!;
        this.ctx.drawImage(
          this.blackholeImage,
          -size / 2,
          -size / 2,
          size,
          size
        );
      } else if (obstacle.type === 'asteroid') {
        // Dessin existant pour les astéroïdes
        this.ctx.drawImage(
          this.obstacleImage,
          -obstacle.size / 2,
          -obstacle.size / 2,
          obstacle.size,
          obstacle.size
        );
      }

      this.ctx.restore();
    });
  }

  private startGame(): void {
    this.score = 0;
    this.scoreMultiplier = 1;
    this.isGameStarted = true;
    this.isGameOver = false;
    this.isPaused = false;
    this.survivalTime = 0;
    this.lastTimestamp = performance.now();
    this.obstacles = [];
    this.position = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
    };
    this.velocity = { x: 0, y: 0 };
    this.rotation = 0;
    this.updateGameState();
    this.speedBonusActive = false; // Réinitialisation du bonus de vitesse

    const parallaxElement = this.parallaxBg.nativeElement;
    parallaxElement.style.transform =
      'rotateX(0deg) rotateY(0deg) translate3d(0, 0, 0)';
  }

  private checkCollisions(): boolean {
    const shipRadius = this.spaceshipSize.width / 3;

    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const obstacle = this.obstacles[i];
      // Les trous noirs ne sont dangereux que lorsqu'ils sont stables
      if (obstacle.type === 'blackhole' && obstacle.state !== 'stable') {
        continue;
      }

      const dx = this.position.x - obstacle.x;
      const dy = this.position.y - obstacle.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const minDistance =
        shipRadius + (obstacle.currentSize || obstacle.size) / 3;

      if (distance < minDistance) {
        if (this.hasShield) {
          // Effet de destruction du bouclier
          this.createShieldBreakParticles();
          // Effet de destruction de l'obstacle
          this.createObstacleDestructionParticles(obstacle);
          // Supprimer l'obstacle
          this.obstacles.splice(i, 1);
          this.hasShield = false;
          return false; // Ne pas terminer la partie
        }
        return true; // Collision fatale
      }
    }
    return false;
  }

  private createObstacleDestructionParticles(obstacle: Obstacle): void {
    const particleCount = 15;
    const colors = ['#ff4136', '#ff851b', '#ffdc00']; // Couleurs d'explosion

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const speed = 6 * (0.8 + Math.random() * 0.4);
      const size = (obstacle.size / 4) * (0.5 + Math.random() * 0.5);

      this.particles.push({
        x: obstacle.x,
        y: obstacle.y,
        speed: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        size,
        color: colors[Math.floor(Math.random() * colors.length)],
        alpha: 1,
        rotation: Math.random() * Math.PI * 2,
      });
    }

    // Ajouter un flash lumineux à l'endroit de la collision
    this.particles.push({
      x: obstacle.x,
      y: obstacle.y,
      speed: { x: 0, y: 0 },
      size: obstacle.size * 1.5,
      color: '#ffffff',
      alpha: 0.8,
      rotation: 0,
    });
  }

  private updateGameState(): void {
    const canvas = this.canvasRef.nativeElement;
    if (this.isGameStarted && !this.isPaused && !this.isGameOver) {
      canvas.classList.add('playing');
    } else {
      canvas.classList.remove('playing');
    }
  }

  private spawnCollectible(): void {
    // Choix aléatoire du type de collectible
    const collectibleConfig =
      this.COLLECTIBLE_TYPES[
        Math.floor(Math.random() * this.COLLECTIBLE_TYPES.length)
      ];

    // Position aléatoire (pas trop près des bords)
    const margin = this.COLLECTIBLE_SIZE;
    const x = margin + Math.random() * (window.innerWidth - 2 * margin);
    const y = margin + Math.random() * (window.innerHeight - 2 * margin);

    this.collectibles.push({
      x,
      y,
      type: collectibleConfig.type,
      rotation: Math.random() * Math.PI * 2,
      collected: false,
      value: collectibleConfig.value,
      effect: collectibleConfig.effect,
      auraRotation: Math.random() * Math.PI * 2,
      auraScale: this.AURA_MIN_SCALE,
    });
  }

  private drawCollectibles(): void {
    if (!this.oresImageLoaded) return;

    this.collectibles.forEach((collectible) => {
      if (collectible.collected) return;

      // Mise à jour de l'aura
      collectible.auraRotation += this.AURA_ROTATION_SPEED;
      collectible.auraScale =
        this.AURA_MIN_SCALE +
        ((Math.sin(performance.now() * this.AURA_PULSE_SPEED) + 1) / 2) *
          (this.AURA_MAX_SCALE - this.AURA_MIN_SCALE);

      this.ctx.save();
      this.ctx.translate(collectible.x, collectible.y);

      // Dessin de l'aura
      this.ctx.rotate(collectible.auraRotation);
      this.ctx.globalAlpha = 0.3;

      // Dégradé radial pour l'aura
      const gradient = this.ctx.createRadialGradient(
        0,
        0,
        this.COLLECTIBLE_SIZE / 3,
        0,
        0,
        this.COLLECTIBLE_SIZE * collectible.auraScale
      );

      // Couleur de l'aura selon le type de collectible
      let auraColor: string;
      switch (collectible.effect) {
        case 'score':
          auraColor = '#ffd700'; // Or
          break;
        case 'multiplier':
          auraColor = '#ff00ff'; // Magenta
          break;
        case 'speed':
          auraColor = '#00ffff'; // Cyan
          break;
        case 'shield':
          auraColor = '#4169e1'; // Bleu royal
          break;
        default:
          auraColor = '#ffffff'; // Blanc
      }

      gradient.addColorStop(0, `${auraColor}80`); // 50% opacité
      gradient.addColorStop(1, `${auraColor}00`); // 0% opacité

      this.ctx.fillStyle = gradient;

      // Dessin des rayons de l'aura
      this.ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        const scale = collectible.auraScale;
        this.ctx.moveTo(0, 0);
        this.ctx.lineTo(
          Math.cos(angle) * this.COLLECTIBLE_SIZE * scale,
          Math.sin(angle) * this.COLLECTIBLE_SIZE * scale
        );
      }
      this.ctx.stroke();

      // Dessin du cercle de l'aura
      this.ctx.beginPath();
      this.ctx.arc(
        0,
        0,
        this.COLLECTIBLE_SIZE * collectible.auraScale,
        0,
        Math.PI * 2
      );
      this.ctx.fill();

      // Réinitialisation pour le dessin du sprite
      this.ctx.globalAlpha = 1;
      this.ctx.rotate(collectible.rotation - collectible.auraRotation);

      // Calcul de la position du sprite dans l'image
      const spriteX =
        (collectible.type % this.SPRITES_PER_ROW) * this.SPRITE_SIZE;
      const spriteY =
        Math.floor(collectible.type / this.SPRITES_PER_ROW) * this.SPRITE_SIZE;

      // Dessin du sprite
      this.ctx.drawImage(
        this.oresImage,
        spriteX,
        spriteY,
        this.SPRITE_SIZE,
        this.SPRITE_SIZE,
        -this.COLLECTIBLE_SIZE / 2,
        -this.COLLECTIBLE_SIZE / 2,
        this.COLLECTIBLE_SIZE,
        this.COLLECTIBLE_SIZE
      );

      this.ctx.restore();
    });
  }

  private checkCollectibleCollisions(): void {
    const shipRadius = this.spaceshipSize.width / 3;

    this.collectibles = this.collectibles.filter((collectible) => {
      if (collectible.collected) return false;

      const dx = this.position.x - collectible.x;
      const dy = this.position.y - collectible.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < shipRadius + this.COLLECTIBLE_SIZE / 2) {
        this.collectItem(collectible);
        return false;
      }

      return true;
    });
  }

  private createCollectParticles(collectible: Collectible): void {
    // Déterminer la couleur des particules selon le type de collectible
    let particleColor: string;
    switch (collectible.effect) {
      case 'score':
        particleColor = '#ffd700';
        break;
      case 'multiplier':
        particleColor = '#ff00ff';
        break;
      case 'speed':
        particleColor = '#00ffff';
        break;
      case 'shield':
        particleColor = '#4169e1';
        break;
      default:
        particleColor = '#ffffff';
    }

    // Créer les particules
    for (let i = 0; i < this.PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / this.PARTICLE_COUNT;
      const speed = this.PARTICLE_SPEED * (0.5 + Math.random() * 0.5);

      this.particles.push({
        x: collectible.x,
        y: collectible.y,
        speed: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        size: this.PARTICLE_SIZE * (0.5 + Math.random() * 0.5),
        color: particleColor,
        alpha: 1,
        rotation: Math.random() * Math.PI * 2,
      });
    }
  }

  private updateAndDrawParticles(): void {
    // Mettre à jour et dessiner les particules
    this.particles = this.particles.filter((particle) => {
      // Mettre à jour la position
      particle.x += particle.speed.x;
      particle.y += particle.speed.y;

      // Faire tourner la particule
      particle.rotation += 0.1;

      // Réduire l'opacité plus rapidement pour les grosses particules (flash)
      const decayRate = particle.size > 50 ? 0.1 : 0.02;
      particle.alpha -= decayRate;

      // Dessiner la particule si elle est encore visible
      if (particle.alpha > 0) {
        this.ctx.save();
        this.ctx.translate(particle.x, particle.y);
        this.ctx.rotate(particle.rotation);
        this.ctx.globalAlpha = particle.alpha;

        if (particle.size > 50) {
          // Pour le flash lumineux
          const gradient = this.ctx.createRadialGradient(
            0,
            0,
            0,
            0,
            0,
            particle.size
          );
          gradient.addColorStop(
            0,
            'rgba(255, 255, 255, ' + particle.alpha + ')'
          );
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          this.ctx.fillStyle = gradient;
          this.ctx.beginPath();
          this.ctx.arc(0, 0, particle.size, 0, Math.PI * 2);
          this.ctx.fill();
        } else {
          // Pour les débris
          this.ctx.beginPath();
          this.ctx.moveTo(-particle.size, 0);
          this.ctx.lineTo(particle.size, 0);
          this.ctx.moveTo(0, -particle.size);
          this.ctx.lineTo(0, particle.size);
          this.ctx.strokeStyle = particle.color;
          this.ctx.lineWidth = 2;
          this.ctx.stroke();
        }

        this.ctx.restore();
        return true;
      }
      return false;
    });
  }

  private collectItem(collectible: Collectible): void {
    this.createCollectParticles(collectible);

    switch (collectible.effect) {
      case 'score':
        this.addScore(collectible.value);
        break;
      case 'multiplier':
        this.scoreMultiplier += 0.5;
        break;
      case 'speed':
        this.speedBonusActive = true;
        this.speedBonusEndTime = performance.now() + this.SPEED_BONUS_DURATION;
        break;
      case 'shield':
        if (!this.hasShield) {
          this.hasShield = true;
          this.shieldOpacity = 0; // Commencer avec une opacité nulle pour l'effet de fade in
        }
        break;
    }
  }

  private createShieldBreakParticles(): void {
    for (let i = 0; i < this.SHIELD_BREAK_PARTICLE_COUNT; i++) {
      const angle = (Math.PI * 2 * i) / this.SHIELD_BREAK_PARTICLE_COUNT;
      const speed =
        this.SHIELD_BREAK_PARTICLE_SPEED * (0.8 + Math.random() * 0.4);
      const color =
        this.SHIELD_BREAK_PARTICLE_COLORS[
          Math.floor(Math.random() * this.SHIELD_BREAK_PARTICLE_COLORS.length)
        ];

      this.shieldBreakParticles.push({
        x: this.position.x,
        y: this.position.y,
        speed: {
          x: Math.cos(angle) * speed,
          y: Math.sin(angle) * speed,
        },
        size: this.SHIELD_BREAK_PARTICLE_SIZE * (0.8 + Math.random() * 0.4),
        color: color,
        alpha: 1,
        rotation: Math.random() * Math.PI * 2,
      });
    }
  }

  private updateAndDrawShield(): void {
    if (this.hasShield) {
      // Effet de fade in du bouclier
      if (this.shieldOpacity < this.SHIELD_MAX_OPACITY) {
        this.shieldOpacity += this.SHIELD_FADE_SPEED;
      }

      // Dessin du bouclier
      this.ctx.save();
      this.ctx.translate(this.position.x, this.position.y);

      // Créer un dégradé radial pour le bouclier
      const gradient = this.ctx.createRadialGradient(
        0,
        0,
        this.shieldRadius * 0.7,
        0,
        0,
        this.shieldRadius
      );
      gradient.addColorStop(0, `rgba(65, 105, 225, 0)`);
      gradient.addColorStop(0.5, `rgba(65, 105, 225, ${this.shieldOpacity})`);
      gradient.addColorStop(
        1,
        `rgba(0, 255, 255, ${this.shieldOpacity * 0.5})`
      );

      this.ctx.fillStyle = gradient;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, this.shieldRadius, 0, Math.PI * 2);
      this.ctx.fill();

      // Effet de ligne énergétique
      this.ctx.strokeStyle = `rgba(255, 255, 255, ${this.shieldOpacity * 0.8})`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(0, 0, this.shieldRadius, 0, Math.PI * 2);
      this.ctx.stroke();

      this.ctx.restore();
    }
  }

  private updateAndDrawShieldBreakParticles(): void {
    this.shieldBreakParticles = this.shieldBreakParticles.filter((particle) => {
      particle.x += particle.speed.x;
      particle.y += particle.speed.y;
      particle.alpha -= 0.02;
      particle.rotation += 0.1;

      if (particle.alpha > 0) {
        this.ctx.save();
        this.ctx.translate(particle.x, particle.y);
        this.ctx.rotate(particle.rotation);
        this.ctx.globalAlpha = particle.alpha;

        // Dessin d'une particule en forme d'éclat
        this.ctx.beginPath();
        this.ctx.moveTo(-particle.size, 0);
        this.ctx.lineTo(particle.size, 0);
        this.ctx.moveTo(0, -particle.size);
        this.ctx.lineTo(0, particle.size);
        this.ctx.strokeStyle = particle.color;
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        this.ctx.restore();
        return true;
      }
      return false;
    });
  }

  private gameLoop(timestamp: number): void {
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    if (this.isGameStarted && !this.isGameOver) {
      this.updateTime(timestamp);

      if (!this.isPaused) {
        // Spawn des nouveaux obstacles avec intervalle variable
        if (
          timestamp - this.lastObstacleSpawn >
          this.getCurrentSpawnInterval()
        ) {
          this.spawnObstacle();
          this.lastObstacleSpawn = timestamp;
        }

        // Spawn des collectibles
        if (
          timestamp - this.lastCollectibleSpawn >
          this.SPAWN_COLLECTIBLE_INTERVAL
        ) {
          this.spawnCollectible();
          this.lastCollectibleSpawn = timestamp;
        }

        // Mise à jour des positions
        this.updateSpaceshipPosition();
        this.updateObstacles();
        this.checkCollectibleCollisions();

        // Vérification des collisions avec les obstacles
        if (this.checkCollisions()) {
          this.isGameOver = true;
          this.isPaused = true;
          this.updateGameState();
        }
      }

      // Dessin de tous les éléments
      this.drawObstacles();
      this.updateAndDrawShield(); // Dessiner le bouclier derrière le vaisseau
      this.drawSpaceship();
      this.drawCollectibles();
      this.updateAndDrawParticles();
      this.updateAndDrawShieldBreakParticles();
    }

    requestAnimationFrame((t) => this.gameLoop(t));
  }

  // Méthode pour augmenter le score
  private addScore(points: number): void {
    this.score += Math.floor(points * this.scoreMultiplier);
  }

  // Ajout d'une méthode pour afficher visuellement la durée restante du bonus
  public getSpeedBonusTimeLeft(): number {
    if (!this.speedBonusActive) return 0;
    return Math.max(0, (this.speedBonusEndTime - performance.now()) / 1000);
  }
}
