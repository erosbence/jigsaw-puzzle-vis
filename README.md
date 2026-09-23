# Reference Implementation for *FragmentVis: Data Visualization-Based Analysis of Puzzle Players' Solution Strategies*

This repository contains the reference implementation for the paper *FragmentVis: Data Visualization-Based Analysis of Puzzle Players' Solution Strategies*.

FragmentVis is a browser-based visual analytics system for the retrospective analysis of digital jigsaw puzzle-solving behavior. During gameplay, the system records piece-level interaction data and transforms these data into interactive visual representations that support the exploration and interpretation of players' solution strategies.

The project was developed at the **Faculty of Informatics, University of Debrecen, Hungary**.

## Online Demo

A deployed version of FragmentVis is available at:

https://fragmentvispuzzle.pythonanywhere.com/

## Dependencies

The backend requires Python and the following packages:

- [Flask](https://flask.palletsprojects.com/) 3.0.3
- [OpenCV](https://opencv.org/) 4.10.0.84
- [NumPy](https://numpy.org/) 2.1.1

The frontend is implemented in JavaScript and uses [p5.js](https://p5js.org/) for interactive puzzle rendering.

The required Python packages are listed in:

[`puzzleapp/backend/requirements.txt`](puzzleapp/backend/requirements.txt)

## Running the Application

Clone the repository:

```bash
git clone https://github.com/erosbence/jigsaw-puzzle-vis.git
cd jigsaw-puzzle-vis
```

Install the required Python packages:

```bash
pip install -r puzzleapp/backend/requirements.txt
```

Run the application from the repository root:

```bash
python -m puzzleapp.app
```

The Flask development server will then serve both the frontend and the backend API. By default, the application can typically be accessed at:

```text
http://127.0.0.1:5000/
```

## Code Organization

The implementation is organized into a lightweight Python/Flask backend and a browser-based frontend.

```text
jigsaw-puzzle-vis/
└── puzzleapp/
    ├── app.py
    ├── backend/
    │   ├── api/
    │   ├── services/
    │   ├── utils/
    │   ├── requirements.txt
    │   └── wsgi.py
    └── frontend/
        ├── public/
        └── src/
            ├── analytics/
            ├── api/
            ├── canvas/
            ├── styles/
            ├── ui/
            └── main.js
```

### Backend

The backend is responsible primarily for processing the source image and its corresponding segmentation mask and generating the irregular puzzle pieces used by the application.

The Flask application entry point is:

[`puzzleapp/app.py`](puzzleapp/app.py)

Backend components are located in:

[`puzzleapp/backend`](puzzleapp/backend)

### Frontend

After puzzle generation, user interaction, rendering, telemetry collection, and most analytical computations are handled on the client side.

The main frontend source code is located in:

[`puzzleapp/frontend/src`](puzzleapp/frontend/src)

The main JavaScript entry point is:

[`puzzleapp/frontend/src/main.js`](puzzleapp/frontend/src/main.js)

The analytical components are located in:

[`puzzleapp/frontend/src/analytics`](puzzleapp/frontend/src/analytics)

## Related Publication & Citation

The manuscript associated with this repository has been **accepted for publication** in the *Eurasian Journal of Mathematical and Computer Applications*.

**Bence Dániel Erős and Roland Kunkli**  
*FragmentVis: Data Visualization-Based Analysis of Puzzle Players' Solution Strategies*  
*Eurasian Journal of Mathematical and Computer Applications*  
**Accepted for publication.**

If you use FragmentVis or build upon the methods implemented in this repository, please cite the associated paper as follows:

```bibtex
@article{eros_kunkli_fragmentvis,
  author  = {Er{\H{o}}s, Bence D{\'a}niel and Kunkli, Roland},
  title   = {{FragmentVis: Data Visualization-Based Analysis of Puzzle Players' Solution Strategies}},
  journal = {Eurasian Journal of Mathematical and Computer Applications},
  note    = {Accepted for publication}
}
```

## Institution

This research project was developed at the:

**University of Debrecen**  
**Faculty of Informatics**  
Debrecen, Hungary
