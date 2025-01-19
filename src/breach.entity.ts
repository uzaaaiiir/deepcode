import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Breach {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ nullable: true })
  username: string;

  @Column({ nullable: true })
  password: string;

  @Column()
  url: string;

  @Column({ nullable: true })
  domain: string;

  @Column({ nullable: true })
  ipAddress: string;

  @Column('simple-array', { nullable: true })
  tags: string[];

  @Column({ nullable: true })
  status: number;

  @Column({ nullable: true })
  title: string;

  @Column({ nullable: true })
  port: number;

  @Column({ nullable: true })
  urlPath: string;

  @Column({ nullable: true })
  protocol: string;
}
