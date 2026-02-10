import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MessageService } from '../../services/message.service';
import { Subscription } from 'rxjs';
import { MaterialModule } from '../../material.module';
import { ApiResponse } from '../../models/api-response.model';
import { Series } from '../../models/series.model';
import { RecognitionConfig, RecognitionService } from '../../services/recognition.service';
import { SeriesService } from '../../services/series.service';
import { IssueService } from '../../services/issue.service';

interface PerformanceLevel {
  value: string;
  label: string;
  hint: string;
}

interface BulkOperationResult {
  updated: number;
  skipped: number;
  failed: number;
}

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, RouterModule, ReactiveFormsModule],
})
export class AdminComponent implements OnInit, OnDestroy {
  private sub = new Subscription();
  private originalFormValue: any;

  // Tab state
  selectedTabIndex = 0;

  // Recognition Config State
  config?: RecognitionConfig;
  configForm!: FormGroup;

  selectedPresetIndex = 0;
  hasUnsavedChanges = false;

  loadingSeries = false;
  loadingConfig = false;

  // Global Operations State
  allSeries: Series[] = [];
  reverifyingAllSeries = false;
  reverifyingAllIssues = false;
  backfillingMetadata = false;
  reverifySeriesProgress = { current: 0, total: 0 };
  reverifyIssuesProgress = { current: 0, total: 0 };

  performanceLevels: PerformanceLevel[] = [
    { value: 'balanced', label: 'Balanced', hint: 'Best balance between speed and quality' },
    { value: 'fast', label: 'Fast', hint: 'Optimized for speed' },
    { value: 'high_performance', label: 'High Performance', hint: 'Maximum quality, slower processing' },
    { value: 'minimal', label: 'Minimal', hint: 'Lightweight processing' },
    { value: 'akaze_focused', label: 'AKAZE Focused', hint: 'Specialized AKAZE detection' }
  ];

  Object = Object;

  constructor(
    private recognitionService: RecognitionService,
    private seriesService: SeriesService,
    private issueService: IssueService,
    private fb: FormBuilder,
    private messageService: MessageService
  ) {}

  ngOnInit(): void {
    this.loadConfiguration();
    this.loadAllSeries();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  // ========== Recognition Configuration Methods ==========

  private loadConfiguration(): void {
    this.loadingConfig = true;
    const load$ = this.recognitionService
      .getRecognitionConfig()
      .subscribe({
        next: (res: ApiResponse<RecognitionConfig>) => {
          if (!res.data) throw new Error('issue getRecognitionConfig');

          this.config = res.data;
          this.buildForm(this.config);
          this.originalFormValue = JSON.parse(JSON.stringify(this.configForm.value));
          this.trackFormChanges();

          this.loadingConfig = false;
        },
        error: (err: Error) => {
          console.error('Failed to load configuration:', err);
          this.messageService.error('Failed to load configuration.');
          this.loadingConfig = false;
        }
      });
    this.sub.add(load$);
  }

  private buildForm(cfg: RecognitionConfig): void {
    const presetGroups = Object.entries(cfg.presets).reduce(
      (acc, [presetName, preset]) => {
        acc[presetName] = this.fb.group({
          detectors: this.buildMapGroup(preset.detectors),
          feature_weights: this.buildMapGroup(preset.feature_weights),
          image_size: [preset.image_size],
          max_workers: [preset.max_workers],
          options: this.fb.group({
            use_advanced_matching: [preset.options.use_advanced_matching],
            use_comic_detection: [preset.options.use_comic_detection],
            cache_only: [preset.options.cache_only ?? false],
          }),
        });
        return acc;
      },
      {} as { [key: string]: FormGroup }
    );

    this.configForm = this.fb.group({
      performance_level: [cfg.performance_level],
      result_batch: [cfg.result_batch],
      similarity_threshold: [cfg.similarity_threshold],
      presets: this.fb.group(presetGroups),
    });
  }

  private buildMapGroup(map: Record<string, any>) {
    const controls = Object.entries(map).reduce((acc, [k, v]) => {
      acc[k] = [v];
      return acc;
    }, {} as { [key: string]: any });
    return this.fb.group(controls);
  }

  private trackFormChanges(): void {
    const changes$ = this.configForm.valueChanges.subscribe(() => {
      this.hasUnsavedChanges = JSON.stringify(this.configForm.value) !==
                               JSON.stringify(this.originalFormValue);
    });
    this.sub.add(changes$);
  }

  onSave(): void {
    if (this.configForm.invalid) {
      this.messageService.warning('Please fix the errors before saving.');
      return;
    }

    const updated: RecognitionConfig = this.configForm.value as RecognitionConfig;

    const save$ = this.recognitionService
      .saveRecognitionConfig(updated)
      .subscribe({
        next: (res: ApiResponse<boolean>) => {
          this.messageService.success('Configuration saved successfully');
          this.config = updated;
          this.originalFormValue = JSON.parse(JSON.stringify(this.configForm.value));
          this.hasUnsavedChanges = false;
        },
        error: (err: Error) => {
          console.error('Save error:', err);
          this.messageService.error('Failed to save configuration');
        },
      });
    this.sub.add(save$);
  }

  onCancel(): void {
    if (this.hasUnsavedChanges) {
      this.configForm.patchValue(this.originalFormValue);
      this.hasUnsavedChanges = false;
      this.messageService.info('Changes discarded');
    }
  }

  onExport(): void {
    if (!this.configForm) return;

    const dataStr = JSON.stringify(this.configForm.value, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `recognition-config-${new Date().toISOString().split('T')[0]}.json`;
    link.click();

    URL.revokeObjectURL(url);

    this.messageService.success('Configuration exported successfully');
  }

  onImport(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.files?.length) return;

    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const importedConfig = JSON.parse(e.target?.result as string);
        this.buildForm(importedConfig);
        this.hasUnsavedChanges = true;

        this.messageService.info('Configuration imported. Click Save to apply.');
      } catch (error) {
        console.error('Import error:', error);
        this.messageService.error('Invalid configuration file');
      }
    };

    reader.readAsText(file);
    input.value = '';
  }

  getPresetIcon(presetKey: string): string {
    const iconMap: { [key: string]: string } = {
      'balanced': 'balance',
      'fast': 'flash_on',
      'high_performance': 'rocket_launch',
      'minimal': 'minimize',
      'akaze_focused': 'filter_center_focus',
      'default': 'view_module'
    };
    return iconMap[presetKey.toLowerCase()] || iconMap['default'];
  }

  get presetControls() {
    return (this.configForm?.get('presets') as any)?.controls ?? {};
  }

  // ========== Global Operations Methods ==========

  private loadAllSeries(): void {
    this.loadingSeries = true;
    const series$ = this.seriesService.getAllSeries().subscribe({
      next: (res: ApiResponse<Series[]>) => {
        if (res.data) {
          this.allSeries = res.data;
        }
        this.loadingSeries = false;
      },
      error: (err: Error) => {
        console.error('Failed to load series:', err);
        this.loadingSeries = false;
      }
    });
    this.sub.add(series$);
  }

  reverifyAllSeries(): void {
    if (this.allSeries.length === 0) {
      this.messageService.warning('No series to reverify');
      return;
    }

    this.reverifyingAllSeries = true;
    this.reverifySeriesProgress = { current: 0, total: this.allSeries.length };

    let completed = 0;
    let failed = 0;

    const processNext = (index: number) => {
      if (index >= this.allSeries.length) {
        this.reverifyingAllSeries = false;
        this.messageService.success(`Reverified ${completed} series (${failed} failed)`, { duration: 5000 });
        return;
      }

      const series = this.allSeries[index];
      this.seriesService.reverifySeries(series.id!).subscribe({
        next: () => {
          completed++;
          this.reverifySeriesProgress.current = index + 1;
          processNext(index + 1);
        },
        error: (err) => {
          console.error(`Failed to reverify series ${series.name}:`, err);
          failed++;
          this.reverifySeriesProgress.current = index + 1;
          processNext(index + 1);
        }
      });
    };

    processNext(0);
  }

  reverifyAllIssues(): void {
    if (this.allSeries.length === 0) {
      this.messageService.warning('No series to reverify issues for');
      return;
    }

    this.reverifyingAllIssues = true;
    this.reverifyIssuesProgress = { current: 0, total: this.allSeries.length };

    let totalUpdated = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    const processNext = (index: number) => {
      if (index >= this.allSeries.length) {
        this.reverifyingAllIssues = false;
        this.messageService.success(`Issues reverified: ${totalUpdated} updated, ${totalSkipped} skipped, ${totalFailed} failed`, { duration: 5000 });
        return;
      }

      const series = this.allSeries[index];
      this.issueService.reverifyIssues(series.id!).subscribe({
        next: (res) => {
          if (res.data) {
            totalUpdated += res.data.updated;
            totalSkipped += res.data.skipped;
            totalFailed += res.data.failed;
          }
          this.reverifyIssuesProgress.current = index + 1;
          processNext(index + 1);
        },
        error: (err) => {
          console.error(`Failed to reverify issues for series ${series.name}:`, err);
          this.reverifyIssuesProgress.current = index + 1;
          processNext(index + 1);
        }
      });
    };

    processNext(0);
  }

  backfillMetadata(): void {
    this.backfillingMetadata = true;

    const backfill$ = this.seriesService.backfillRecognitionMetadata().subscribe({
      next: (res) => {
        this.backfillingMetadata = false;
        if (res.data) {
          this.messageService.success(
            `Backfill complete: ${res.data.updated} updated, ${res.data.skipped} skipped, ${res.data.failed} failed`,
            { duration: 5000 }
          );
        } else {
          this.messageService.success('Backfill complete');
        }
      },
      error: (err: Error) => {
        console.error('Backfill error:', err);
        this.backfillingMetadata = false;
        this.messageService.error('Failed to backfill recognition metadata');
      }
    });
    this.sub.add(backfill$);
  }
}
