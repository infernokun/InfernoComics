import { CommonModule } from '@angular/common';
import { OnInit, OnDestroy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../material.module';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';
import { ApiResponse } from '../../models/api-response.model';
import { RecognitionConfig, RecognitionService } from '../../services/recognition.service';

interface PerformanceLevel {
  value: string;
  label: string;
  hint: string;
}

@Component({
  selector: 'app-config',
  templateUrl: './recognition-config.component.html',
  styleUrls: ['./recognition-config.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, RouterModule, ReactiveFormsModule],
})
export class RecognitionConfigComponent implements OnInit, OnDestroy {
  config?: RecognitionConfig;
  configForm!: FormGroup;
  private sub = new Subscription();
  private originalFormValue: any;
  
  Object = Object;
  selectedPresetIndex = 0;
  hasUnsavedChanges = false;

  performanceLevels: PerformanceLevel[] = [
    { 
      value: 'balanced', 
      label: 'Balanced', 
      hint: 'Best balance between speed and quality' 
    },
    { 
      value: 'fast', 
      label: 'Fast', 
      hint: 'Optimized for speed' 
    },
    { 
      value: 'high_performance', 
      label: 'High Performance', 
      hint: 'Maximum quality, slower processing' 
    },
    { 
      value: 'minimal', 
      label: 'Minimal', 
      hint: 'Lightweight processing' 
    },
    { 
      value: 'akaze_focused', 
      label: 'AKAZE Focused', 
      hint: 'Specialized AKAZE detection' 
    }
  ];

  constructor(
    private recognitionService: RecognitionService,
    private fb: FormBuilder,
    private snackBar: MatSnackBar
  ) {}

  ngOnInit(): void {
    this.loadConfiguration();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  private loadConfiguration(): void {
    const load$ = this.recognitionService
      .getRecognitionConfig()
      .subscribe({
        next: (res: ApiResponse<RecognitionConfig>) => {
          this.config = res.data;
          this.buildForm(this.config);
          this.originalFormValue = JSON.parse(JSON.stringify(this.configForm.value));
          this.trackFormChanges();
        },
        error: (err) => {
          console.error('Failed to load configuration:', err);
          this.snackBar.open('Failed to load configuration.', 'Close', {
            duration: 3000,
          });
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
      this.snackBar.open('Please fix the errors before saving.', 'Close', {
        duration: 3000,
      });
      return;
    }

    const updated: RecognitionConfig = this.configForm.value as RecognitionConfig;
    
    const save$ = this.recognitionService
      .saveRecognitionConfig(updated)
      .subscribe({
        next: (res: ApiResponse<boolean>) => {
          this.snackBar.open('✓ Configuration saved successfully', 'Close', {
            duration: 2500,
          });
          this.config = updated;
          this.originalFormValue = JSON.parse(JSON.stringify(this.configForm.value));
          this.hasUnsavedChanges = false;
        },
        error: (err) => {
          console.error('Save error:', err);
          this.snackBar.open('✗ Failed to save configuration', 'Close', {
            duration: 3000,
          });
        },
      });
    this.sub.add(save$);
  }

  onCancel(): void {
    if (this.hasUnsavedChanges) {
      this.configForm.patchValue(this.originalFormValue);
      this.hasUnsavedChanges = false;
      this.snackBar.open('Changes discarded', 'Close', { duration: 2000 });
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
    
    this.snackBar.open('Configuration exported successfully', 'Close', {
      duration: 2500,
    });
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
        
        this.snackBar.open('Configuration imported. Click Save to apply.', 'Close', {
          duration: 3000,
        });
      } catch (error) {
        console.error('Import error:', error);
        this.snackBar.open('Invalid configuration file', 'Close', {
          duration: 3000,
        });
      }
    };

    reader.readAsText(file);
    input.value = ''; // Reset input
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
}