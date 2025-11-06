import { CommonModule } from '@angular/common';
import { OnInit, OnDestroy, Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MaterialModule } from '../../material.module';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RecognitionConfig, RecognitionService} from '../../services/recognition-config.service';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-config',
  templateUrl: './config.component.html',
  styleUrls: ['./config.component.scss'],
  imports: [CommonModule, MaterialModule, FormsModule, RouterModule, ReactiveFormsModule],
})
export class ConfigComponent implements OnInit, OnDestroy {
  config?: RecognitionConfig;

  configForm!: FormGroup;

  private sub = new Subscription();

  Object = Object;

  constructor(private recognitionService: RecognitionService, private fb: FormBuilder, private snackBar: MatSnackBar) {}

  ngOnInit(): void {
    const load$ = this.recognitionService
      .getRecognitionConfig()
      .subscribe((cfg) => {
        this.config = cfg;
        this.buildForm(cfg);
      });

    this.sub.add(load$);
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
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

  onSave(): void {
    if (this.configForm.invalid) {
      this.snackBar.open('Please fix the errors before saving.', 'Close', {
        duration: 3000,
      });
      return;
    }

    const updated: RecognitionConfig = this.configForm
      .value as RecognitionConfig;

    const save$ = this.recognitionService
      .saveRecognitionConfig(updated)
      .subscribe({
        next: () => {
          this.snackBar.open('Configuration saved successfully.', 'Close', {
            duration: 2500,
          });
          this.config = updated;
        },
        error: (err) => {
          console.error(err);
          this.snackBar.open('Failed to save configuration.', 'Close', {
            duration: 3000,
          });
        },
      });

    this.sub.add(save$);
  }

  get presetControls() {
    return (this.configForm?.get('presets') as any)?.controls ?? {};
  }
}
