export class StoredObject {
  id?: string;
  createdBy?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;

  constructor(serverResult?: any) {
    if (serverResult) {
      this.id = serverResult.id;
      this.createdBy = serverResult.createdBy;
      this.updatedBy = serverResult.updatedBy;
      this.createdAt = serverResult.createdAt ? new Date(serverResult.createdAt) : undefined;
      this.updatedAt = serverResult.updatedAt ? new Date(serverResult.updatedAt) : undefined;
    }
  }
}
