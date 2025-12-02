import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, map, Observable, tap } from 'rxjs';
import { User } from '../models/user.model';
import { ApiResponse } from '../models/api-response.model';
import { EnvironmentService } from './environment.service';
import { BaseService } from './base.service';

@Injectable({
  providedIn: 'root'
})
export class UserService extends BaseService {
  private usersSubject = new BehaviorSubject<User[]>([]);
  private loggedInUserSubject = new BehaviorSubject<User | undefined>(undefined);
  loggedInUser$: Observable<User | undefined> = this.loggedInUserSubject.asObservable();

  constructor(
    protected httpClient: HttpClient,
    private environmentService: EnvironmentService) {
    super(httpClient);
  }

  get users$(): Observable<User[]> {
    return this.usersSubject.asObservable();
  }

  getLoggedInUser(): Observable<User | undefined> {
    return this.loggedInUser$;
  }

  setLoggedInUser(user: User): void {
    this.loggedInUserSubject.next(user);
  }

  getUserById(id: string): Observable<User | undefined> {
    return this.get<ApiResponse<User>>(this.environmentService.settings?.restUrl + '/user/' + id)
      .pipe(
        map((response: ApiResponse<User>) => new User(response.data))
      );
  }

  getAllUsers(): Observable<User[]> {
    return this.get<ApiResponse<User[]>>(this.environmentService.settings?.restUrl + '/user').pipe(
      map((response: ApiResponse<User[]>) => response.data.map((user) => new User(user))),
      tap((users) => {
        this.usersSubject.next(users);
      })
    );
  }

  setUserTeam(userId: string, teamId: string) {
    return this.put<ApiResponse<User>>(this.environmentService.settings?.restUrl + '/user/team',
      {},
      { params: { userId: userId, teamId: teamId } }
    )
      .pipe(
        map((response: ApiResponse<User>) => new User(response.data))
      );
  }
}
