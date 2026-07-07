import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonListHeader,
  IonItem,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonButton,
  IonIcon,
  IonNote,
  IonBadge,
  AlertController,
  ToastController,
} from '@ionic/angular/standalone';
import { DataService } from '../../core/services/data.service';
import { SyncService } from '../../core/sync/sync.service';
import { SyncConfig } from '../../core/sync/sync-config';

/**
 * Settings tab. Two jobs:
 *  1. Show storage/offline status and data counts.
 *  2. Configure the optional remote-sync backend (Supabase primary, Firebase
 *     alternative). Credentials are the user's own and are stored only in the
 *     offline store — nothing is bundled or sent anywhere except the user's
 *     chosen backend.
 */
@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    DatePipe,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonList,
    IonListHeader,
    IonItem,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonToggle,
    IonButton,
    IonIcon,
    IonNote,
    IonBadge,
  ],
  templateUrl: './settings.page.html',
})
export class SettingsPage {
  private readonly data = inject(DataService);
  private readonly sync = inject(SyncService);
  private readonly alertCtrl = inject(AlertController);
  private readonly toastCtrl = inject(ToastController);

  readonly backend = this.data.backend;
  readonly workoutCount = this.data.workoutCount;
  readonly exerciseCount = computed(() => this.data.exercises().length);
  readonly routineCount = computed(() => this.data.routines().length);

  readonly syncStatus = this.sync.status;
  readonly lastSyncedAt = this.sync.lastSyncedAt;
  readonly lastError = this.sync.lastError;
  readonly pendingChanges = this.sync.pendingChanges;
  readonly hasData = this.data.hasData;

  // Local editable copy of the sync config.
  readonly provider = signal<SyncConfig['provider']>('none');
  readonly supabaseUrl = signal('');
  readonly supabaseAnonKey = signal('');
  readonly firebaseDbUrl = signal('');
  readonly autoSync = signal(false);

  constructor() {
    const cfg = this.sync.config();
    this.provider.set(cfg.provider);
    this.supabaseUrl.set(cfg.supabaseUrl ?? '');
    this.supabaseAnonKey.set(cfg.supabaseAnonKey ?? '');
    this.firebaseDbUrl.set(cfg.firebaseConfig?.['databaseURL'] ?? '');
    this.autoSync.set(cfg.autoSync ?? false);
  }

  statusColor(): string {
    switch (this.syncStatus()) {
      case 'success':
        return 'success';
      case 'error':
        return 'danger';
      case 'syncing':
        return 'warning';
      case 'offline':
        return 'medium';
      default:
        return 'medium';
    }
  }

  async saveAndSync(): Promise<void> {
    const config: SyncConfig = {
      provider: this.provider(),
      autoSync: this.autoSync(),
      supabaseUrl: this.supabaseUrl().trim() || undefined,
      supabaseAnonKey: this.supabaseAnonKey().trim() || undefined,
      firebaseConfig: this.firebaseDbUrl().trim()
        ? { databaseURL: this.firebaseDbUrl().trim() }
        : undefined,
    };
    await this.sync.saveConfig(config);

    if (config.provider === 'none') {
      await this.toast('Sync disabled. FitFlow keeps working offline.');
      return;
    }
    const msg = await this.sync.syncNow();
    await this.toast(msg);
  }

  async syncNow(): Promise<void> {
    const msg = await this.sync.syncNow();
    await this.toast(msg);
  }

  async exportData(): Promise<void> {
    const json = JSON.stringify(this.data.buildExport(), null, 2);
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fitflow-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await this.toast('Backup downloaded.');
    } catch {
      // In environments without DOM download support, show the JSON instead.
      const alert = await this.alertCtrl.create({
        header: 'Backup JSON',
        message: `<pre style="white-space:pre-wrap;max-height:40vh;overflow:auto">${json.slice(0, 4000)}</pre>`,
        buttons: ['Close'],
      });
      await alert.present();
    }
  }

  /**
   * Import a JSON backup via a file picker. The chosen file is parsed and
   * reconciled into local data with the last-write-wins merge engine (never a
   * blind overwrite), so importing on a device with existing history is safe.
   */
  importData(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        return;
      }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const summary = await this.data.importData(parsed);
        await this.toast(
          `Imported ${summary.workouts} workouts, ${summary.exercises} exercises, ${summary.routines} routines.`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid file.';
        await this.toast(`Import failed: ${msg}`);
      }
    };
    input.click();
  }

  /** One-tap seed of ~12 weeks of realistic demo history. */
  async loadDemo(): Promise<void> {
    const seeded = await this.data.loadDemoData();
    await this.toast(
      seeded
        ? 'Loaded 12 weeks of demo history — check the Stats tab.'
        : 'You already have workouts; demo data was skipped.',
    );
  }

  private async toast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({
      message,
      duration: 2500,
      position: 'bottom',
    });
    await t.present();
  }
}
