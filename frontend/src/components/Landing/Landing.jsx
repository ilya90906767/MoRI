import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import './Landing.css';

const Landing = () => {
  const [activeQuestion, setActiveQuestion] = useState(null);
  const [brainHighlights, setBrainHighlights] = useState(false);
  const [statCounts, setStatCounts] = useState({ users: 0, scans: 0, insights: 0 });

  useEffect(() => {
    // Animation for statistics counting up
    const targetStats = { users: 1250, scans: 5780, insights: 18540 };
    const duration = 2000; // 2 seconds animation
    const frameRate = 60;
    const totalFrames = duration / (1000 / frameRate);
    let frame = 0;

    const interval = setInterval(() => {
      frame++;
      const progress = Math.min(frame / totalFrames, 1);
      // Easing function for smoother animation
      const easedProgress = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      
      setStatCounts({
        users: Math.floor(targetStats.users * easedProgress),
        scans: Math.floor(targetStats.scans * easedProgress),
        insights: Math.floor(targetStats.insights * easedProgress)
      });

      if (frame >= totalFrames) clearInterval(interval);
    }, 1000 / frameRate);

    // Toggle brain highlights periodically
    const brainInterval = setInterval(() => {
      setBrainHighlights(prev => !prev);
    }, 3000);

    return () => {
      clearInterval(interval);
      clearInterval(brainInterval);
    };
  }, []);

  const toggleQuestion = (index) => {
    setActiveQuestion(activeQuestion === index ? null : index);
  };

  const faqs = [
    {
      question: "How accurate is the AI-powered analysis?",
      answer: "Our AI models have been trained on over 10,000 brain scans and achieve 94% accuracy in identifying common abnormalities, verified against diagnoses from leading neurologists."
    },
    {
      question: "Can I integrate this platform with my existing medical systems?",
      answer: "Yes, our platform offers API integration with major hospital management systems and PACS. We provide dedicated support for custom integrations to ensure seamless workflow incorporation."
    },
    {
      question: "What security measures are in place to protect patient data?",
      answer: "We implement HIPAA-compliant security protocols with end-to-end encryption, secure cloud storage, and comprehensive audit logs. All data is anonymized by default, and we never share patient information with third parties."
    },
    {
      question: "Do you offer training for medical staff?",
      answer: "Yes, we provide comprehensive onboarding sessions, video tutorials, and monthly webinars. Our support team is available 24/7 to assist with any questions or training needs."
    }
  ];

  return (
    <div className="landing-container">
      <div className="landing-hero">
        <div className="hero-content">
          <h1 className="hero-title">Advanced Brain MRI Analysis</h1>
          <h2 className="hero-subtitle">AI-powered insights for medical professionals</h2>
          <p className="hero-description">
            Our platform combines cutting-edge AI technology with medical expertise to provide detailed 
            analysis of brain MRI scans, morphometry data, and predictive insights.
          </p>
          <div className="hero-actions">
            <Link to="/login" className="hero-button primary">Login</Link>
            <Link to="/register" className="hero-button secondary">Create Account</Link>
          </div>
        </div>
        <div className="hero-image">
          <div className={`brain-visualization ${brainHighlights ? 'highlights' : ''}`}></div>
          <div className="brain-hotspots">
            <div className="hotspot" style={{top: '30%', left: '20%'}} data-label="Frontal Lobe"></div>
            <div className="hotspot" style={{top: '15%', left: '50%'}} data-label="Motor Cortex"></div>
            <div className="hotspot" style={{top: '40%', left: '80%'}} data-label="Temporal Lobe"></div>
            <div className="hotspot" style={{top: '70%', left: '50%'}} data-label="Cerebellum"></div>
          </div>
        </div>
      </div>

      {/* Statistics Section */}
      <div className="landing-stats">
        <div className="stat-card">
          <div className="stat-number">{statCounts.users.toLocaleString()}+</div>
          <div className="stat-label">Doctors & Researchers</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{statCounts.scans.toLocaleString()}+</div>
          <div className="stat-label">MRI Scans Analyzed</div>
        </div>
        <div className="stat-card">
          <div className="stat-number">{statCounts.insights.toLocaleString()}+</div>
          <div className="stat-label">Clinical Insights Generated</div>
        </div>
      </div>

      <div className="landing-features">
        <div className="feature-card">
          <div className="feature-icon brain-icon"></div>
          <h3>Advanced Visualization</h3>
          <p>Interactive 3D visualization of MRI scans with precise slice navigation and analysis tools.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon ai-icon"></div>
          <h3>AI-Powered Analysis</h3>
          <p>Leverage machine learning models trained on thousands of brain scans to identify patterns and abnormalities.</p>
        </div>
        <div className="feature-card">
          <div className="feature-icon data-icon"></div>
          <h3>Detailed Morphometry</h3>
          <p>Extract quantitative measurements of brain structures for comprehensive morphometric analysis.</p>
        </div>
      </div>

      {/* How it Works Section */}
      <div className="landing-how-it-works">
        <h2 className="section-title">How It Works</h2>
        <div className="process-steps">
          <div className="process-step">
            <div className="step-number">1</div>
            <h3>Upload MRI Scans</h3>
            <p>Securely upload DICOM files through our encrypted platform or integrate directly with your PACS system.</p>
            <div className="step-icon upload-icon"></div>
          </div>
          <div className="process-connector"></div>
          <div className="process-step">
            <div className="step-number">2</div>
            <h3>AI Processing</h3>
            <p>Our advanced neural networks analyze the scans, extracting morphometric data and identifying regions of interest.</p>
            <div className="step-icon process-icon"></div>
          </div>
          <div className="process-connector"></div>
          <div className="process-step">
            <div className="step-number">3</div>
            <h3>Interactive Analysis</h3>
            <p>Explore results through our intuitive interface with 3D visualization and detailed morphometric measurements.</p>
            <div className="step-icon analysis-icon"></div>
          </div>
          <div className="process-connector"></div>
          <div className="process-step">
            <div className="step-number">4</div>
            <h3>Clinical Insights</h3>
            <p>Generate comprehensive reports and receive AI-assisted interpretations to support clinical decision-making.</p>
            <div className="step-icon insights-icon"></div>
          </div>
        </div>
      </div>

      {/* Demo Section */}
      <div className="landing-demo">
        <div className="demo-content">
          <h2>See the Platform in Action</h2>
          <p>Watch how our platform transforms complex neuroimaging data into actionable clinical insights.</p>
          <button className="demo-button">Watch Demo</button>
        </div>
        <div className="demo-preview">
          <div className="demo-screen">
            <div className="demo-overlay">
              <div className="play-button"></div>
            </div>
          </div>
        </div>
      </div>

      <div className="landing-testimonial">
        <blockquote>
          <p>"This platform has transformed how we analyze and interpret brain MRI data, providing insights we couldn't obtain through conventional methods."</p>
          <cite>— Dr. Sarah Chen, Neurology Department</cite>
        </blockquote>
      </div>

      {/* FAQ Section */}
      <div className="landing-faq">
        <h2 className="section-title">Frequently Asked Questions</h2>
        <div className="faq-container">
          {faqs.map((faq, index) => (
            <div 
              key={index} 
              className={`faq-item ${activeQuestion === index ? 'active' : ''}`}
              onClick={() => toggleQuestion(index)}
            >
              <div className="faq-question">
                <h3>{faq.question}</h3>
                <div className="faq-toggle"></div>
              </div>
              <div className="faq-answer">
                <p>{faq.answer}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Technology Stack Section */}
      <div className="landing-tech">
        <h2 className="section-title">Powered by Leading Technology</h2>
        <div className="tech-logos">
          <div className="tech-logo" data-name="TensorFlow">
            <div className="tech-icon tf-icon"></div>
            <span>TensorFlow</span>
          </div>
          <div className="tech-logo" data-name="PyTorch">
            <div className="tech-icon pytorch-icon"></div>
            <span>PyTorch</span>
          </div>
          <div className="tech-logo" data-name="React">
            <div className="tech-icon react-icon"></div>
            <span>React</span>
          </div>
          <div className="tech-logo" data-name="Nibabel">
            <div className="tech-icon nibabel-icon"></div>
            <span>Nibabel</span>
          </div>
          <div className="tech-logo" data-name="FSL">
            <div className="tech-icon fsl-icon"></div>
            <span>FSL</span>
          </div>
        </div>
      </div>

      <div className="landing-cta">
        <h2>Ready to elevate your neuroimaging analysis?</h2>
        <Link to="/register" className="cta-button">Get Started Today</Link>
      </div>
    </div>
  );
};

export default Landing; 