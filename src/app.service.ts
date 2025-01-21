import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Breach } from './breach.entity';
import { Repository } from 'typeorm';
import { Groq } from 'groq-sdk';

//import Configuration, { OpenAI } from 'openai';
//import pLimit from 'p-limit';

import axios from 'axios';
import * as cheerio from 'cheerio';
import { resolve4 } from 'dns/promises';
import * as fs from 'fs';
import * as readline from 'readline';
import { Like } from 'typeorm';

@Injectable()
export class AppService {
  //private limit: any; // rate limiter

  private postsCache: any | null = null;
  private groupsCache: any | null = null;

  constructor(
    @InjectRepository(Breach)
    private breachRepository: Repository<Breach>,
  ) {
    const maxRequestPerMinute = 60; // 60 req / min
    //this.limit = pLimit(Math.floor(maxRequestPerMinute / 60)); // 1 req / min
  }

  /**
   * Detect the application associated with a URL based on predefined patterns.
   * @param url - URL to analyze.
   */
  private detectApplication(url: string): string {
    const patterns = [
      { app: 'WordPress', regex: /wp-login\.php|wp-admin/i },
      { app: 'Joomla', regex: /administrator\/index\.php/i },
      { app: 'Magento', regex: /\/admin|\/admin\/login/i },
      { app: 'Drupal', regex: /user\/login/i },
      { app: 'Shopify', regex: /\.myshopify\.com/i },
      { app: 'Roblox', regex: /roblox\.com\/account\/signupredir/i },
      { app: 'Discord', regex: /discord\.com\/login|discordapp\.com/i },
      { app: 'Facebook', regex: /facebook\.com\/login\.php|facebook\.com/i },
      { app: 'Amazon', regex: /amazon\.com|amazon\.co\.uk/i },
      { app: 'Netflix', regex: /netflix\.com/i },
      { app: 'Google', regex: /accounts\.google\.com|\/signin/i },
      { app: 'Apple', regex: /apple\.com/i },
      { app: 'GitHub', regex: /github\.com\/login/i },
      { app: 'Twitter', regex: /twitter\.com/i },
      { app: 'LinkedIn', regex: /linkedin\.com\/login/i },
    ];

    for (const pattern of patterns) {
      if (pattern.regex.test(url)) {
        return pattern.app;
      }
    }

    return 'UNKNOWN';
  }

  /**
   * Fetch and cache RansomWatch data.
   */
  private async fetchRansomWatchData() {
    if (!this.postsCache || !this.groupsCache) {
      const postsUrl =
        'https://raw.githubusercontent.com/joshhighet/ransomwatch/main/posts.json';
      const groupsUrl =
        'https://raw.githubusercontent.com/joshhighet/ransomwatch/main/groups.json';

      const [postsResponse, groupsResponse] = await Promise.all([
        axios.get(postsUrl),
        axios.get(groupsUrl),
      ]);

      this.postsCache = postsResponse.data;
      this.groupsCache = groupsResponse.data;
    }

    return { posts: this.postsCache, groups: this.groupsCache };
  }

  async parseAndEnrichFile(filePath: string): Promise<any> {
    // parse the file by lne and store in a list
    const data = [];
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const fileStream = fs.createReadStream(filePath);
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      const tasks = [];
      rl.on('line', (line) => {
        tasks.push(this.processLine(line));
      });

      rl.on('close', async () => {
        await Promise.allSettled(tasks);
        console.log(`Processing completed in ${Date.now() - start}ms`);
        resolve(data);
      });

      rl.on('error', (err) => {
        reject(err);
      });
    });
  }

  async processLine(line: string): Promise<void> {
    const { username, password, url } = this.getUsernamePasswordAndUrl(line);
    if (!username || !password || !url) {
      return;
    }

    try {
      const { domain, protocol, port, path } =
        await this.resolveUrlDetails(url);
      const { ipAddress, tags: dnsTags } = await this.resolveIpAddress(domain);
      const { status, title, tags: urlTags } = await this.verifyUrl(url);
      const html = status === 200 ? await this.fetchHtml(url) : null;
      const formTags = html ? await this.analyzeLoginForm(html) : { tags: [] };
      const ransomTags = await this.getRansomTags(domain, title);
      const application = this.detectApplication(url);

      const allTags = [...dnsTags, ...urlTags, ...formTags.tags, ...ransomTags];

      const breach = new Breach();
      breach.username = username;
      breach.password = password;
      breach.url = url;
      breach.domain = domain;
      breach.ipAddress = ipAddress;
      breach.tags = allTags;
      breach.status = status;
      breach.title = title;
      breach.port = +port || 0;
      breach.urlPath = path;
      breach.protocol = protocol;
      breach.app = application;

      await this.breachRepository.save(breach);
    } catch (error) {}
  }

  getUsernamePasswordAndUrl(data: string): {
    username: string;
    password: string;
    url: string;
  } {
    const parts = data.split(':');
    if (parts.length < 3) {
      return { username: '', password: '', url: data };
    }

    const url = parts.slice(0, parts.length - 2).join(':');
    const username = parts[parts.length - 2];
    const password = parts[parts.length - 1];

    return { username, password, url };
  }

  async resolveUrlDetails(url: string) {
    try {
      const urlObject = new URL(url);
      const domain = urlObject.hostname;
      const protocol = urlObject.protocol;
      const path = urlObject.pathname;
      const port = urlObject.port || '80';

      return { domain, protocol, path, port };
    } catch (error) {
      return { domain: '', protocol: '', path: '', port: '' };
    }
  }

  async filterBreaches(query: Record<string, string>): Promise<any> {
    const qb = this.breachRepository.createQueryBuilder('breach');

    // Apply filters dynamically
    for (const [key, value] of Object.entries(query)) {
      if (key === 'tags') {
        // Handle multiple tags
        const tags = value.split(',');
        tags.forEach((tag, index) => {
          qb.andWhere(`FIND_IN_SET(:tag${index}, breach.tags) > 0`, {
            [`tag${index}`]: tag.trim(),
          });
        });
      } else if (key === 'routableOnly' && value === 'true') {
        // Filter out non-routable IPs
        qb.andWhere(
          `(NOT breach.ipAddress LIKE '127.%' AND NOT breach.ipAddress = 'localhost' AND NOT breach.ipAddress = '0.0.0.0' AND NOT breach.ipAddress LIKE '192.168.%' AND NOT breach.ipAddress LIKE '10.%' AND NOT (breach.ipAddress LIKE '172.%' AND SUBSTRING_INDEX(breach.ipAddress, '.', 2) BETWEEN '172.16' AND '172.31'))`,
        );
      } else {
        qb.andWhere(`breach.${key} = :${key}`, { [key]: value });
      }
    }

    return qb.getMany();
  }

  findAll(): Promise<Breach[]> {
    return this.breachRepository.find();
  }
  // async resolveIpAddress(domain: string) {
  //   try {
  //     const addresses = await resolve4(domain);
  //     return { ipAddress: addresses[0], tags: [] };
  //   } catch (error) {
  //     console.error('Error resolving domain:', error.message);
  //     return { ipAddress: '0.0.0.0', tags: ['unresolved'] };
  //   }
  // }

  async resolveIpAddress(domain: string) {
    try {
      const addresses = await resolve4(domain);
      return { ipAddress: addresses[0], tags: ['RESOLVED'] };
    } catch (error) {
      const rootDomain = domain.split('.').slice(-2).join('.');
      try {
        const addresses = await resolve4(rootDomain);
        return { ipAddress: addresses[0], tags: ['root-domain-fallback'] };
      } catch {
        return { ipAddress: '0.0.0.0', tags: ['unresolved'] };
      }
    }
  }

  async verifyUrl(url: string) {
    try {
      const response = await axios.get(url, { timeout: 15000 });
      const $ = cheerio.load(response.data);
      const title = $('title').text();
      return {
        status: response.status,
        title,
        tags: ['Accessible'],
      };
    } catch (error) {
      return { status: 0, title: '', tags: ['inaccessible'] };
    }
  }

  async analyzeLoginForm(html: string): Promise<{ tags: string[] }> {
    const tags = [];
    if (html.includes('<input type="password"')) {
      tags.push('login-form');
    }

    if (html.includes('CAPTCHA')) {
      tags.push('captcha-required');
    }

    if (html.includes('2FA') || html.includes('OTP')) {
      tags.push('Mfa-required');
    }

    return { tags };
  }

  async fetchHtml(url: string): Promise<string | null> {
    try {
      const response = await axios.get(url, { timeout: 15000 });
      return response.data;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get tags based on RansomWatch data.
   */
  async getRansomTags(domain: string, title: string): Promise<string[]> {
    const tags = [];
    const { posts, groups } = await this.fetchRansomWatchData();

    // Match domain with group locations
    const linkedGroups = groups.filter((group) =>
      group.locations.some((location: any) => location.fqdn.includes(domain)),
    );

    const groupNames = linkedGroups.map((group) => group.name).slice(0, 5);

    if (groupNames.length > 0) {
      tags.push(`RANSOM_GROUP: ${groupNames.join(', ')}`);
    }

    // Match title with posts
    const matchingPost = posts.find((post) => title.includes(post.post_title));
    if (matchingPost) {
      tags.push(`RANSOM_POST: ${matchingPost.group_name}`);
    }

    return tags;
  }
}
