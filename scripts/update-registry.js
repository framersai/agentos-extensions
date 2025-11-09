#!/usr/bin/env node

/**
 * Script to update the extension registry
 * Scans all directories and updates registry.json
 */

const fs = require('fs');
const path = require('path');

const registryPath = path.join(__dirname, '../registry.json');
const rootDir = path.join(__dirname, '..');

function scanExtensions() {
  const registry = {
    version: '1.0.0',
    updated: new Date().toISOString(),
    categories: {
      templates: [],
      curated: ['core', 'research', 'productivity', 'ai-models', 'enterprise'],
      community: ['research', 'productivity', 'development', 'integrations', 'utilities']
    },
    extensions: {
      curated: [],
      community: [],
      templates: []
    },
    stats: {
      totalExtensions: 0,
      curatedCount: 0,
      communityCount: 0,
      templateCount: 0,
      totalDownloads: 0
    }
  };
  
  // Scan templates
  const templatesDir = path.join(rootDir, 'templates');
  if (fs.existsSync(templatesDir)) {
    fs.readdirSync(templatesDir).forEach(template => {
      const templatePath = path.join(templatesDir, template);
      const packageJsonPath = path.join(templatePath, 'package.json');
      
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
        registry.categories.templates.push(template);
        registry.extensions.templates.push({
          id: `com.framers.template.${template}`,
          name: packageJson.description || template,
          package: packageJson.name,
          version: packageJson.version,
          path: `templates/${template}`,
          description: packageJson.description,
          repository: `https://github.com/framersai/agentos-extensions/tree/master/templates/${template}`
        });
        registry.stats.templateCount++;
      }
    });
  }
  
  // Scan curated extensions
  const curatedDir = path.join(rootDir, 'curated');
  if (fs.existsSync(curatedDir)) {
    registry.categories.curated.forEach(category => {
      const categoryPath = path.join(curatedDir, category);
      if (fs.existsSync(categoryPath)) {
        fs.readdirSync(categoryPath).forEach(extension => {
          const extPath = path.join(categoryPath, extension);
          const packageJsonPath = path.join(extPath, 'package.json');
          const manifestPath = path.join(extPath, 'manifest.json');
          
          if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const manifest = fs.existsSync(manifestPath) 
              ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
              : {};
            
            registry.extensions.curated.push({
              id: manifest.id || `com.framers.${category}.${extension}`,
              name: manifest.name || packageJson.description,
              package: packageJson.name,
              version: packageJson.version,
              category,
              path: `curated/${category}/${extension}`,
              description: manifest.description || packageJson.description,
              author: manifest.author || packageJson.author,
              features: manifest.features || [],
              tools: manifest.extensions?.map(e => e.id) || [],
              keywords: manifest.keywords || packageJson.keywords || [],
              npm: `https://www.npmjs.com/package/${packageJson.name}`,
              repository: `https://github.com/framersai/agentos-extensions/tree/master/curated/${category}/${extension}`,
              verified: true,
              downloads: 0
            });
            registry.stats.curatedCount++;
          }
        });
      }
    });
  }
  
  // Scan community extensions
  const communityDir = path.join(rootDir, 'community');
  if (fs.existsSync(communityDir)) {
    registry.categories.community.forEach(category => {
      const categoryPath = path.join(communityDir, category);
      if (fs.existsSync(categoryPath)) {
        fs.readdirSync(categoryPath).forEach(extension => {
          const extPath = path.join(categoryPath, extension);
          const packageJsonPath = path.join(extPath, 'package.json');
          const manifestPath = path.join(extPath, 'manifest.json');
          
          if (fs.existsSync(packageJsonPath)) {
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
            const manifest = fs.existsSync(manifestPath) 
              ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
              : {};
            
            registry.extensions.community.push({
              id: manifest.id || `com.community.${category}.${extension}`,
              name: manifest.name || packageJson.description,
              package: packageJson.name,
              version: packageJson.version,
              category,
              path: `community/${category}/${extension}`,
              description: manifest.description || packageJson.description,
              author: manifest.author || packageJson.author,
              keywords: manifest.keywords || packageJson.keywords || [],
              npm: `https://www.npmjs.com/package/${packageJson.name}`,
              repository: `https://github.com/framersai/agentos-extensions/tree/master/community/${category}/${extension}`,
              downloads: 0
            });
            registry.stats.communityCount++;
          }
        });
      }
    });
  }
  
  registry.stats.totalExtensions = 
    registry.stats.curatedCount + 
    registry.stats.communityCount;
  
  return registry;
}

function updateRegistry() {
  const registry = scanExtensions();
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
  
  console.log('✅ Registry updated:');
  console.log(`  - Curated: ${registry.stats.curatedCount}`);
  console.log(`  - Community: ${registry.stats.communityCount}`);
  console.log(`  - Templates: ${registry.stats.templateCount}`);
  console.log(`  - Total: ${registry.stats.totalExtensions}`);
}

updateRegistry();