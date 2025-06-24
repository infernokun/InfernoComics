import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { ApiResponse } from '../../models/api-response.model';
import { LabActionResult } from '../../models/lab/lab-action-result.model';
import { Lab } from '../../models/lab/lab.model';

@Injectable({
  providedIn: 'root'
})
export class LabDeploymentService {
  // Subjects for events
  private deployLabSubject = new Subject<Lab>();
  deployLab$ = this.deployLabSubject.asObservable();

  private deployLabResponseSubject = new Subject<ApiResponse<LabActionResult>>();
  deployLabResponse$ = this.deployLabResponseSubject.asObservable();

  // Use BehaviorSubject to maintain loading state
  private labsLoadingSubject = new BehaviorSubject<Set<string>>(new Set<string>());
  labsLoading$ = this.labsLoadingSubject.asObservable();

  // Start lab deployment
  startLabDeployment(lab: Lab): void {
    if (!lab.id) return;

    // Add lab to loading set
    const currentLoading = new Set(this.labsLoadingSubject.value);
    currentLoading.add(lab.id);
    this.labsLoadingSubject.next(currentLoading);

    // Emit the lab to trigger deployment
    this.deployLabSubject.next(lab);
  }

  // Handle deployment response from API
  startLabDeploymentFinish(response: ApiResponse<LabActionResult>): void {
    // Emit response
    this.deployLabResponseSubject.next(response);

    // Remove lab from loading state
    const labId = response.data.labTracker?.labStarted?.id;
    if (labId) {
      this.finishLabDeployment(labId);
    }
  }

  // Update loading state (may be called from component if needed)
  updateLabsLoading(labsLoading: Set<string>): void {
    this.labsLoadingSubject.next(labsLoading);
  }

  // Clear a specific lab from loading state
  finishLabDeployment(labId: string): void {
    const currentLoading = new Set(this.labsLoadingSubject.value);
    currentLoading.delete(labId);
    this.labsLoadingSubject.next(currentLoading);
  }

  // Helper to check if a lab is loading
  isLabLoading(labId: string): boolean {
    return this.labsLoadingSubject.value.has(labId);
  }

  getLabsLoading() {
    return this.labsLoadingSubject.value;
  }
}
