import { Component, computed, inject } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';
import { RestTimerService } from '../../core/services/rest-timer.service';

/**
 * Floating animated rest-timer overlay.
 *
 * Renders only while a rest countdown is active. The circular progress ring is
 * a plain SVG whose stroke-dashoffset is driven by the timer service's
 * `progress` signal, so it animates smoothly as the seconds tick without any
 * charting dependency. A CSS keyframe pulse draws the eye as time runs low.
 */
@Component({
  selector: 'app-rest-timer',
  standalone: true,
  imports: [IonButton, IonIcon],
  templateUrl: './rest-timer.component.html',
  styleUrl: './rest-timer.component.scss',
})
export class RestTimerComponent {
  readonly timer = inject(RestTimerService);

  private readonly radius = 34;
  readonly circumference = 2 * Math.PI * this.radius;

  /** Stroke offset for the progress ring, based on 0..1 progress. */
  readonly dashOffset = computed(
    () => this.circumference * (1 - this.timer.progress()),
  );

  /** Emphasise the ring in the final 10 seconds. */
  readonly urgent = computed(
    () => this.timer.running() && this.timer.remainingSec() <= 10,
  );

  addTime(): void {
    this.timer.adjust(15);
  }

  skip(): void {
    this.timer.stop();
  }
}
