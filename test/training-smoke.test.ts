import './integration.setup.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseManager } from '../src/database/repositories/databaseManager.ts';
import { AuthService } from '../src/services/domains/auth/AuthService.ts';
import { PermissionService } from '../src/services/domains/auth/PermissionService.ts';
import { TrainingService } from '../src/services/domains/hr/TrainingService.ts';

async function bootstrap() {
  const db = DatabaseManager.getInstance();
  await db.initialize();
  await PermissionService.seed();
  AuthService.login('admin', 'admin123');
  return db;
}

test('training service manages trainers, courses, enrollments, skills and gaps', async () => {
  await bootstrap();
  const trainer = TrainingService.createTrainer({ name: 'مدرب اختبار', specialty: 'HR' });
  const course = TrainingService.createCourse({ name: 'دورة اختبار', trainerId: trainer.id, cost: 100, status: 'PLANNED' });
  TrainingService.updateCourseStatus(course.id, 'ONGOING');
  const enrollment = TrainingService.enroll({ courseId: course.id, employeeId: 'emp_x', notes: 'اختبار' });
  TrainingService.updateEnrollment(enrollment.id, { status: 'COMPLETED', attendancePercent: 100, score: 90, certificateExpiry: '2030-01-01' });
  const skill = TrainingService.createSkill({ name: 'مهارة اختبار', category: 'Technical' });
  TrainingService.addJobSkill({ jobTitle: 'موظف', skillId: skill.id, requiredLevel: 2 });
  const es = TrainingService.addEmployeeSkill({ employeeId: 'emp_x', skillId: skill.id, level: 1 });
  assert.equal(es.level, 1);
  const gaps = TrainingService.getTrainingGaps('موظف');
  assert.ok(Array.isArray(gaps));
  const expiring = TrainingService.getExpiringCertificates(3650);
  assert.ok(Array.isArray(expiring));
});
